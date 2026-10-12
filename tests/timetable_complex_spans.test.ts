import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { PlumwareTimetableParser } from '../src/adapters/plumware/plumware_timetable_parser.js';
import { ScheduleResolver } from '../src/services/schedule_resolver.service.js';
import type { StudentGroupProfile } from '../src/types/academic.js';

function readFixture(name: string): string {
  const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', name);
  return fs.readFileSync(fixturePath, 'utf-8');
}

describe('Audit Vector 1 & 2: Timetable Matrix Normalization & Split Resolution', () => {
  describe('master_timetable_complex_spans.html (5-Period Stress Test & Coordinate Parity)', () => {
    const html = readFixture('master_timetable_complex_spans.html');
    const timetable = PlumwareTimetableParser.parseTimetable(html);

    it('extracts exactly 5 time headers without horizontal coordinate drift', () => {
      expect(timetable.timeHeaders).toHaveLength(5);
      expect(timetable.timeHeaders[0].startTime).toBe('09:00');
      expect(timetable.timeHeaders[0].endTime).toBe('10:00');
      expect(timetable.timeHeaders[1].startTime).toBe('10:00');
      expect(timetable.timeHeaders[1].endTime).toBe('11:00');
      expect(timetable.timeHeaders[2].startTime).toBe('11:00');
      expect(timetable.timeHeaders[2].endTime).toBe('12:00');
      expect(timetable.timeHeaders[3].startTime).toBe('12:00');
      expect(timetable.timeHeaders[3].endTime).toBe('13:00');
      expect(timetable.timeHeaders[4].startTime).toBe('13:00');
      expect(timetable.timeHeaders[4].endTime).toBe('14:00');
    });

    it('places 2-hour lab at Periods 2-3 and strictly lands Period 4 (Lunch) and Period 5 (Lecture) on exact indices', () => {
      const monGrid = timetable.grid['Monday'];
      expect(monGrid).toHaveLength(5);

      // Period 1 (index 0): CS101 Lecture
      const p1 = monGrid[0];
      expect(p1).not.toBeNull();
      expect(p1?.periodIndex).toBe(0);
      expect(p1?.startTime).toBe('09:00');
      expect(p1?.endTime).toBe('10:00');
      expect(p1?.candidateSessions[0].courseCode).toBe('CS101');

      // Periods 2-3 (indices 1 & 2): 2-hour Lab (colspan="2")
      const p2 = monGrid[1];
      const p3 = monGrid[2];
      expect(p2).not.toBeNull();
      expect(p2).toBe(p3); // Both pointers reference the exact same spanning slot
      expect(p2?.periodIndex).toBe(1);
      expect(p2?.spanHours).toBe(2);
      expect(p2?.startTime).toBe('10:00');
      expect(p2?.endTime).toBe('12:00');
      expect(p2?.candidateSessions[0].courseCode).toBe('CS102');

      // Period 4 (index 3): LUNCH interval is normalized to explicit null (Zero Index Drift)
      const p4 = monGrid[3];
      expect(p4).toBeNull();

      // Period 5 (index 4): CS103 Lecture strictly lands at Period 5 / 13:00 (Zero Offset)
      const p5 = monGrid[4];
      expect(p5).not.toBeNull();
      expect(p5?.periodIndex).toBe(4);
      expect(p5?.startTime).toBe('13:00');
      expect(p5?.endTime).toBe('14:00');
      expect(p5?.candidateSessions[0].courseCode).toBe('CS103');
    });

    it('projects vertical rowspan across days and prevents column shifting on Wednesday', () => {
      const tueGrid = timetable.grid['Tuesday'];
      const wedGrid = timetable.grid['Wednesday'];

      // Tuesday Period 5 has SEMINAR with rowspan="2"
      const tueP5 = tueGrid[4];
      expect(tueP5).not.toBeNull();
      expect(tueP5?.candidateSessions[0].courseCode).toBe('SEMINAR');

      // Wednesday has 3-hour WORKSHOP at Periods 1-3 (indices 0, 1, 2)
      const wedP1 = wedGrid[0];
      const wedP2 = wedGrid[1];
      const wedP3 = wedGrid[2];
      expect(wedP1).toBe(wedP2);
      expect(wedP2).toBe(wedP3);
      expect(wedP1?.spanHours).toBe(3);
      expect(wedP1?.candidateSessions[0].courseCode).toBe('WORKSHOP');

      // Wednesday Period 4 (index 3) is Lunch
      expect(wedGrid[3]).toBeNull();
    });
  });

  describe('master_timetable_standard.html (Full 8-Period Section Structure)', () => {
    const html = readFixture('master_timetable_standard.html');
    const timetable = PlumwareTimetableParser.parseTimetable(html);

    it('parses standard 8 periods across all academic days', () => {
      expect(timetable.timeHeaders).toHaveLength(8);
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) {
        expect(timetable.grid[day]).toHaveLength(8);
        // Lunch period (Period 5, index 4) is normalized to explicit null
        expect(timetable.grid[day][4]).toBeNull();
      }
    });
  });

  describe('master_timetable_split_groups.html (Split Batches & Elective Filtering)', () => {
    const html = readFixture('master_timetable_split_groups.html');
    const timetable = PlumwareTimetableParser.parseTimetable(html);

    it('extracts concurrent lab groups as independent candidate entities within single cell', () => {
      const monGrid = timetable.grid['Monday'];
      // Period 5-6 (indices 5 & 6) has 2-hour split lab (colspan="2")
      const splitLabSlot = monGrid[5];
      expect(splitLabSlot).not.toBeNull();
      expect(splitLabSlot).toBe(monGrid[6]);
      expect(splitLabSlot?.candidateSessions).toHaveLength(2);

      const candidateG1 = splitLabSlot?.candidateSessions.find((c) => c.group === 'G1');
      const candidateG2 = splitLabSlot?.candidateSessions.find((c) => c.group === 'G2');

      expect(candidateG1).toBeDefined();
      expect(candidateG1?.courseCode).toBe('PH101');
      expect(candidateG1?.room).toBe('Physics Lab');
      expect(candidateG1?.faculty).toBe('Dr. Raman');

      expect(candidateG2).toBeDefined();
      expect(candidateG2?.courseCode).toBe('EE101');
      expect(candidateG2?.room).toBe('Circuit Lab');
      expect(candidateG2?.faculty).toBe('Dr. Sharma');
    });

    it('enforces Zero-Leakage Group Pruning: G1 student receives ONLY G1 lab', () => {
      const g1Profile: StudentGroupProfile = {
        defaultGroup: 'G1',
        courseGroups: {},
        componentGroups: {
          'PH101:PRACTICAL': 'G1',
          'EE101:PRACTICAL': 'G1',
        },
        registeredCourses: [],
      };

      const resolved = ScheduleResolver.resolvePersonalizedSchedule(timetable, g1Profile);
      const monPracticals = resolved.schedule['Monday'].filter((s) => s.component === 'Practical');

      expect(monPracticals).toHaveLength(1);
      expect(monPracticals[0].courseCode).toBe('PH101');
      expect(monPracticals[0].group).toBe('G1');
      expect(monPracticals[0].room).toBe('Physics Lab');
      // EE101 is 100% pruned for G1 student
      expect(monPracticals.some((s) => s.courseCode === 'EE101')).toBe(false);
    });

    it('enforces Zero-Leakage Group Pruning: G2 student receives ONLY G2 lab', () => {
      const g2Profile: StudentGroupProfile = {
        defaultGroup: 'G2',
        courseGroups: {},
        componentGroups: {
          'PH101:PRACTICAL': 'G2',
          'EE101:PRACTICAL': 'G2',
        },
        registeredCourses: [],
      };

      const resolved = ScheduleResolver.resolvePersonalizedSchedule(timetable, g2Profile);
      const monPracticals = resolved.schedule['Monday'].filter((s) => s.component === 'Practical');

      expect(monPracticals).toHaveLength(1);
      expect(monPracticals[0].courseCode).toBe('EE101');
      expect(monPracticals[0].group).toBe('G2');
      expect(monPracticals[0].room).toBe('Circuit Lab');
      // PH101 is 100% pruned for G2 student
      expect(monPracticals.some((s) => s.courseCode === 'PH101')).toBe(false);
    });

    it('resolves elective course choice strictly matching student registered course', () => {
      // Tuesday Period 1 has concurrent elective offerings: CS311 vs CS312
      const profileWithCS311: StudentGroupProfile = {
        defaultGroup: 'G1',
        courseGroups: {},
        componentGroups: {},
        registeredCourses: [
          { courseCode: 'CS311', courseTitle: 'Cloud Computing', componentType: 'LECTURE', group: 'All' },
          { courseCode: 'CS303', courseTitle: 'Operating Systems', componentType: 'LECTURE', group: 'All' },
        ],
      };

      const resolvedCS311 = ScheduleResolver.resolvePersonalizedSchedule(timetable, profileWithCS311);
      const tueP1Slot = resolvedCS311.schedule['Tuesday'].find((s) => s.periodIndex === 0);
      expect(tueP1Slot).toBeDefined();
      expect(tueP1Slot?.courseCode).toBe('CS311');
      expect(tueP1Slot?.room).toBe('Room 101');

      // Student enrolled in CS312 gets CS312
      const profileWithCS312: StudentGroupProfile = {
        defaultGroup: 'G1',
        courseGroups: {},
        componentGroups: {},
        registeredCourses: [
          { courseCode: 'CS312', courseTitle: 'Cyber Security', componentType: 'LECTURE', group: 'All' },
        ],
      };

      const resolvedCS312 = ScheduleResolver.resolvePersonalizedSchedule(timetable, profileWithCS312);
      const tueP1SlotB = resolvedCS312.schedule['Tuesday'].find((s) => s.periodIndex === 0);
      expect(tueP1SlotB).toBeDefined();
      expect(tueP1SlotB?.courseCode).toBe('CS312');
      expect(tueP1SlotB?.room).toBe('Room 102');

      // Student enrolled in neither gets a free period (null) without error
      const profileNoElective: StudentGroupProfile = {
        defaultGroup: 'G1',
        courseGroups: {},
        componentGroups: {},
        registeredCourses: [
          { courseCode: 'CS399', courseTitle: 'Other Subject', componentType: 'LECTURE', group: 'All' },
        ],
      };

      const resolvedNone = ScheduleResolver.resolvePersonalizedSchedule(timetable, profileNoElective);
      const tueP1SlotNone = resolvedNone.schedule['Tuesday'].find((s) => s.periodIndex === 0);
      expect(tueP1SlotNone).toBeUndefined(); // Free period
    });
  });
});
