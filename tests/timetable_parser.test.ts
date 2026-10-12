import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { PlumwareTimetableParser } from '../src/adapters/plumware/plumware_timetable_parser.js';

describe('PlumwareTimetableParser', () => {
  const readFixture = (filename: string): string => {
    const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', filename);
    return fs.readFileSync(fixturePath, 'utf-8');
  };

  describe('normalizeTimeString', () => {
    it('normalizes standard 24-hour and 12-hour timetable time strings', () => {
      expect(PlumwareTimetableParser.normalizeTimeString('09:00 - 10:00')).toEqual({
        startTime: '09:00',
        endTime: '10:00',
        label: '09:00 - 10:00',
      });

      expect(PlumwareTimetableParser.normalizeTimeString('9:00-10:00')).toEqual({
        startTime: '09:00',
        endTime: '10:00',
        label: '09:00 - 10:00',
      });

      // Afternoon 1:00 - 2:00 converted to 13:00 - 14:00
      expect(PlumwareTimetableParser.normalizeTimeString('1:00 - 2:00')).toEqual({
        startTime: '13:00',
        endTime: '14:00',
        label: '13:00 - 14:00',
      });

      // 12:00 - 1:00 converted to 12:00 - 13:00
      expect(PlumwareTimetableParser.normalizeTimeString('12:00 - 1:00')).toEqual({
        startTime: '12:00',
        endTime: '13:00',
        label: '12:00 - 13:00',
      });
    });

    it('falls back to default period hours when time text is not parseable', () => {
      const fallback0 = PlumwareTimetableParser.normalizeTimeString('Period 1', 0);
      expect(fallback0.startTime).toBe('09:00');
      expect(fallback0.endTime).toBe('10:00');

      const fallback4 = PlumwareTimetableParser.normalizeTimeString('Lunch', 4);
      expect(fallback4.startTime).toBe('13:00');
      expect(fallback4.endTime).toBe('14:00');
    });
  });

  describe('parseDayOfWeek', () => {
    it('normalizes day prefixes to standard DayOfWeek enum', () => {
      expect(PlumwareTimetableParser.parseDayOfWeek('Monday')).toBe('Monday');
      expect(PlumwareTimetableParser.parseDayOfWeek('Mon')).toBe('Monday');
      expect(PlumwareTimetableParser.parseDayOfWeek('Tuesday')).toBe('Tuesday');
      expect(PlumwareTimetableParser.parseDayOfWeek('Wed')).toBe('Wednesday');
      expect(PlumwareTimetableParser.parseDayOfWeek('Thursday')).toBe('Thursday');
      expect(PlumwareTimetableParser.parseDayOfWeek('Friday')).toBe('Friday');
      expect(PlumwareTimetableParser.parseDayOfWeek('Sat')).toBe('Saturday');
      expect(PlumwareTimetableParser.parseDayOfWeek('Sunday')).toBeNull();
      expect(PlumwareTimetableParser.parseDayOfWeek('Period 1')).toBeNull();
    });
  });

  describe('parseCellSessions', () => {
    it('ignores non-academic breaks, lunch, and empty markers', () => {
      expect(PlumwareTimetableParser.parseCellSessions('-')).toHaveLength(0);
      expect(PlumwareTimetableParser.parseCellSessions('LUNCH')).toHaveLength(0);
      expect(PlumwareTimetableParser.parseCellSessions('Library')).toHaveLength(0);
      expect(PlumwareTimetableParser.parseCellSessions('Self Study')).toHaveLength(0);
      expect(PlumwareTimetableParser.parseCellSessions('No Classes Scheduled')).toHaveLength(0);
    });

    it('extracts single lecture details accurately', () => {
      const sessions = PlumwareTimetableParser.parseCellSessions(
        'FCCS0102 (L)\nLT-1\nProf. Sharma'
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].courseCode).toBe('FCCS0102');
      expect(sessions[0].component).toBe('Lecture');
      expect(sessions[0].group).toBe('All');
      expect(sessions[0].room).toBe('LT-1');
      expect(sessions[0].faculty).toBe('Prof. Sharma');
    });

    it('splits concurrent multi-group practicals into distinct candidate sessions', () => {
      const cellText = `
        G1: FCCS0102 (P) [OOP Lab] (Dr. Gupta)
        G2: FCEE0106 (P) [BEE Lab] (Dr. Verma)
      `;

      const sessions = PlumwareTimetableParser.parseCellSessions(cellText);

      expect(sessions).toHaveLength(2);

      // Candidate 1: G1 OOP Lab
      expect(sessions[0].courseCode).toBe('FCCS0102');
      expect(sessions[0].component).toBe('Practical');
      expect(sessions[0].group).toBe('G1');
      expect(sessions[0].room).toBe('OOP Lab');
      expect(sessions[0].faculty).toBe('Dr. Gupta');

      // Candidate 2: G2 BEE Lab
      expect(sessions[1].courseCode).toBe('FCEE0106');
      expect(sessions[1].component).toBe('Practical');
      expect(sessions[1].group).toBe('G2');
      expect(sessions[1].room).toBe('BEE Lab');
      expect(sessions[1].faculty).toBe('Dr. Verma');
    });

    it('inherits shared course code across slash-delimited group tutorial rooms', () => {
      const cellText = 'FCMA0101 (T)\nG1: Room 102 (Dr. Raman) / G2: Room 104 (Dr. Roy)';
      const sessions = PlumwareTimetableParser.parseCellSessions(cellText);

      expect(sessions).toHaveLength(2);
      expect(sessions[0].courseCode).toBe('FCMA0101');
      expect(sessions[0].component).toBe('Tutorial');
      expect(sessions[0].group).toBe('G1');
      expect(sessions[0].room).toBe('Room 102');
      expect(sessions[0].faculty).toBe('Dr. Raman');

      expect(sessions[1].courseCode).toBe('FCMA0101');
      expect(sessions[1].component).toBe('Tutorial');
      expect(sessions[1].group).toBe('G2');
      expect(sessions[1].room).toBe('Room 104');
      expect(sessions[1].faculty).toBe('Dr. Roy');
    });
  });

  describe('2D Grid Normalizer against master_timetable_csb.html', () => {
    it('de-merges master section timetable with colspans and concurrent batches', () => {
      const html = readFixture('master_timetable_csb.html');
      const timetable = PlumwareTimetableParser.parseTimetable(html, {
        program: 'B.Tech',
        branch: 'CSB',
        semester: 1,
        section: '1',
      });

      expect(timetable.program).toBe('B.Tech');
      expect(timetable.branch).toBe('CSB');
      expect(timetable.semester).toBe(1);
      expect(timetable.section).toBe('1');
      expect(timetable.timeHeaders.length).toBe(8);

      // Verify Monday slots
      const mondaySlots = timetable.grid['Monday'].filter((s) => s !== null);
      expect(mondaySlots.length).toBeGreaterThanOrEqual(4);
      expect(mondaySlots[0]?.candidateSessions[0].courseCode).toBe('FCCS0102');

      // Verify Tuesday 2-hour Lab block (colspan="2")
      // Period 1 (10:00 - 11:00) and Period 2 (11:00 - 12:00) should both reference the lab slot
      const tuesdayPeriod1 = timetable.grid['Tuesday'][1];
      const tuesdayPeriod2 = timetable.grid['Tuesday'][2];

      expect(tuesdayPeriod1).toBeDefined();
      expect(tuesdayPeriod2).toBeDefined();
      expect(tuesdayPeriod1?.spanHours).toBe(2);
      expect(tuesdayPeriod1?.startTime).toBe('10:00');
      expect(tuesdayPeriod1?.endTime).toBe('12:00');
      expect(tuesdayPeriod1?.candidateSessions).toHaveLength(2);
      expect(tuesdayPeriod1?.candidateSessions[0].group).toBe('G1');
      expect(tuesdayPeriod1?.candidateSessions[1].group).toBe('G2');

      // Both indices in grid point to the same unified 2-hour slot
      expect(tuesdayPeriod1).toBe(tuesdayPeriod2);

      // Verify lunch at period 4 (13:00 - 14:00) is empty
      expect(timetable.grid['Monday'][4]).toBeNull();
      expect(timetable.grid['Tuesday'][4]).toBeNull();

      // Verify Saturday has zero academic slots
      const saturdaySlots = timetable.grid['Saturday'].filter((s) => s !== null);
      expect(saturdaySlots).toHaveLength(0);
    });
  });

  describe('2D Grid Normalizer against master_timetable_irregular_spans.html', () => {
    it('correctly handles rowspan and prevents column shifting on subsequent days', () => {
      const html = readFixture('master_timetable_irregular_spans.html');
      const timetable = PlumwareTimetableParser.parseTimetable(html);

      expect(timetable.timeHeaders.length).toBe(5);

      // Monday has colspan="2" for CS101 at periods 0 and 1
      const monSlot0 = timetable.grid['Monday'][0];
      const monSlot1 = timetable.grid['Monday'][1];
      expect(monSlot0?.candidateSessions[0].courseCode).toBe('CS101');
      expect(monSlot0?.spanHours).toBe(2);
      expect(monSlot0).toBe(monSlot1);

      // Tuesday Period 0 has CS102 (not shifted by Monday's colspan)
      const tueSlot0 = timetable.grid['Tuesday'][0];
      expect(tueSlot0?.candidateSessions[0].courseCode).toBe('CS102');

      // Tuesday Period 1 has 2-hour split lab
      const tueSlot1 = timetable.grid['Tuesday'][1];
      expect(tueSlot1?.spanHours).toBe(2);
      expect(tueSlot1?.candidateSessions).toHaveLength(2);

      // Wednesday has 3-hour workshop spanning periods 0, 1, 2
      const wedSlot0 = timetable.grid['Wednesday'][0];
      expect(wedSlot0?.spanHours).toBe(3);
      expect(wedSlot0?.candidateSessions[0].courseCode).toBe('WORKSHOP');
    });
  });
});
