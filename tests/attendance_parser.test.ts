import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { PlumwareAttendanceParser } from '../src/adapters/plumware/plumware_attendance_parser.js';
import { BunkIntelligenceService } from '../src/services/bunk_intelligence.service.js';

describe('PlumwareAttendanceParser', () => {
  const readFixture = (filename: string): string => {
    const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', filename);
    return fs.readFileSync(fixturePath, 'utf-8');
  };

  describe('parseCellToken', () => {
    it('handles single present and absent tokens', () => {
      const p = PlumwareAttendanceParser.parseCellToken('1');
      expect(p.classesHeld).toBe(1);
      expect(p.classesAttended).toBe(1);
      expect(p.isHoliday).toBe(false);

      const a = PlumwareAttendanceParser.parseCellToken('0');
      expect(a.classesHeld).toBe(1);
      expect(a.classesAttended).toBe(0);
      expect(a.isHoliday).toBe(false);
    });

    it('handles double block tokens 1+1, 1+0, 0+1', () => {
      const doubleBoth = PlumwareAttendanceParser.parseCellToken('1+1');
      expect(doubleBoth.classesHeld).toBe(2);
      expect(doubleBoth.classesAttended).toBe(2);

      const doubleOne = PlumwareAttendanceParser.parseCellToken('1+0');
      expect(doubleOne.classesHeld).toBe(2);
      expect(doubleOne.classesAttended).toBe(1);

      const doubleMissed = PlumwareAttendanceParser.parseCellToken('0+1');
      expect(doubleMissed.classesHeld).toBe(2);
      expect(doubleMissed.classesAttended).toBe(1);
    });

    it('handles Gazetted Holidays (GH, GH+GH) and Cancellations (CR)', () => {
      const gh = PlumwareAttendanceParser.parseCellToken('GH');
      expect(gh.classesHeld).toBe(0);
      expect(gh.classesAttended).toBe(0);
      expect(gh.isHoliday).toBe(true);

      const cr = PlumwareAttendanceParser.parseCellToken('CR');
      expect(cr.classesHeld).toBe(0);
      expect(cr.classesAttended).toBe(0);
      expect(cr.isRescheduled).toBe(true);

      const doubleGh = PlumwareAttendanceParser.parseCellToken('GH+GH');
      expect(doubleGh.classesHeld).toBe(0);
      expect(doubleGh.isHoliday).toBe(true);
    });

    it('handles empty dashes and unconducted cells', () => {
      const dash = PlumwareAttendanceParser.parseCellToken('-');
      expect(dash.classesHeld).toBe(0);
      expect(dash.classesAttended).toBe(0);

      const empty = PlumwareAttendanceParser.parseCellToken('   ');
      expect(empty.classesHeld).toBe(0);
    });
  });

  describe('parseAttendanceMatrix - Normal Fixture', () => {
    it('parses subject headers, date records, and computes bunk margins', () => {
      const html = readFixture('attendance_normal.html');
      const data = PlumwareAttendanceParser.parseAttendanceMatrix(html);

      expect(data.courseHeaders.length).toBe(3);
      expect(data.courseHeaders.map((h) => h.code)).toEqual(['FCCS0102', 'FCCS0104', 'FCEC0106']);
      expect(data.records.length).toBe(5);

      // Verify mathematical integration
      const { subjects, overallSummary } = BunkIntelligenceService.processMatrix(
        data.courseHeaders,
        data.records,
        data.portalSummaries,
        data.footnotes
      );

      expect(subjects.length).toBe(3);

      // FCCS0102: held=6, present=5 (83.33% -> SAFE)
      const cs102 = subjects.find((s) => s.courseCode === 'FCCS0102')!;
      expect(cs102.totalClasses).toBe(6);
      expect(cs102.present).toBe(5);
      expect(cs102.percentage).toBe(83.33);
      expect(cs102.status).toBe('SAFE');
      // (5 - 0.75 * 6) / 0.75 = 0.5 / 0.75 = 0.666 -> 0 bunks
      expect(cs102.bunkMargin).toBe(0);
      expect(cs102.integrityAudit.hasDiscrepancy).toBe(false);

      // FCCS0104: held=6, present=4 (66.67% -> CRITICAL)
      const cs104 = subjects.find((s) => s.courseCode === 'FCCS0104')!;
      expect(cs104.totalClasses).toBe(6);
      expect(cs104.present).toBe(4);
      expect(cs104.percentage).toBe(66.67);
      expect(cs104.status).toBe('CRITICAL');
      // (0.75 * 6 - 4) / 0.25 = 0.5 / 0.25 = 2 classes needed
      expect(cs104.classesNeededFor75).toBe(2);

      expect(overallSummary.totalHeld).toBe(19);
      expect(overallSummary.totalPresent).toBe(15);
      expect(overallSummary.overallPercentage).toBe(78.95);
      expect(overallSummary.status).toBe('WARNING');
    });
  });

  describe('parseAttendanceMatrix - Holidays & Footnotes Fixture', () => {
    it('properly excludes holidays from held count and extracts footnotes', () => {
      const html = readFixture('attendance_with_holidays.html');
      const data = PlumwareAttendanceParser.parseAttendanceMatrix(html);

      expect(data.courseHeaders.length).toBe(2);
      expect(data.footnotes.length).toBeGreaterThanOrEqual(3);

      const janmashtamiRemark = data.footnotes.find((f) => f.remarkText.includes('JANMASHTAMI'));
      expect(janmashtamiRemark).toBeDefined();
      expect(janmashtamiRemark?.courseCode).toBe('FCCS0102');

      const { subjects } = BunkIntelligenceService.processMatrix(
        data.courseHeaders,
        data.records,
        data.portalSummaries,
        data.footnotes
      );

      const cs102 = subjects.find((s) => s.courseCode === 'FCCS0102')!;
      // Held classes should be 3 (1 on Mon, 2 on Thu via 1+1). Tue(GH), Wed(CR), Sat(GH) excluded.
      expect(cs102.totalClasses).toBe(3);
      expect(cs102.present).toBe(3);
      expect(cs102.percentage).toBe(100.0);
      expect(cs102.remarks.length).toBeGreaterThan(0);
    });
  });

  describe('parseAttendanceMatrix - Low Margin Fixture', () => {
    it('calculates high recovery requirements for severely deficient subjects', () => {
      const html = readFixture('attendance_low_margin.html');
      const data = PlumwareAttendanceParser.parseAttendanceMatrix(html);

      const { subjects } = BunkIntelligenceService.processMatrix(
        data.courseHeaders,
        data.records,
        data.portalSummaries,
        data.footnotes
      );

      const ph101 = subjects.find((s) => s.courseCode === 'FCPH0101')!;
      expect(ph101.totalClasses).toBe(10);
      expect(ph101.present).toBe(3);
      expect(ph101.percentage).toBe(30.0);
      expect(ph101.status).toBe('CRITICAL');
      // (0.75 * 10 - 3) / 0.25 = 4.5 / 0.25 = 18 classes needed
      expect(ph101.classesNeededFor75).toBe(18);
    });
  });

  describe('parseRegisteredCourses - Registration Fixture', () => {
    it('extracts enrolled components, resolves sub-groups and default group', () => {
      const html = readFixture('courses_registered.html');
      const profile = PlumwareAttendanceParser.parseRegisteredCourses(html);

      expect(profile.registeredCourses.length).toBe(7);

      // Verify default group is resolved to most frequent practical group (G1)
      expect(profile.defaultGroup).toBe('G1');

      // Verify specific overrides
      expect(profile.courseGroups['FCEE0106']).toBe('G2');
      expect(profile.courseGroups['FCMA0101']).toBe('T1');

      // Component types verified
      const oopLab = profile.registeredCourses.find((c) => c.courseTitle.includes('Lab'))!;
      expect(oopLab.componentType).toBe('PRACTICAL');
      expect(oopLab.group).toBe('G1');
    });
  });

  describe('Defensive Resilience', () => {
    it('handles empty or completely malformed HTML tables without crashing', () => {
      const malformed = '<html><body><div>No tables here</div></body></html>';
      const matrixData = PlumwareAttendanceParser.parseAttendanceMatrix(malformed);
      expect(matrixData.courseHeaders).toEqual([]);
      expect(matrixData.records).toEqual([]);

      const groupData = PlumwareAttendanceParser.parseRegisteredCourses(malformed);
      expect(groupData.registeredCourses).toEqual([]);
      expect(groupData.defaultGroup).toBe('G1');
    });
  });
});
