import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type MasterSectionTimetable,
  type MasterTimetableSlot,
  type RawTimeSlot,
  type TimeSlotHeader,
  type TimetableComponent,
} from '../../types/timetable.js';
import { logger } from '../../utils/logger.js';

export interface ParseTimetableOptions {
  academicYear?: string;
  program?: string;
  branch?: string;
  semester?: number;
  section?: string;
}

/**
 * High-precision 2D Grid De-merger and Normalization Engine for Plumware Timetables.
 * Resolves complex colspan (multi-hour labs), rowspan (multi-day blocks),
 * and concurrent multi-batch practicals into structured time slots.
 */
export class PlumwareTimetableParser {
  /** Standard NSUT 8-period fallback time matrix (24-hour clock) */
  private static readonly DEFAULT_TIME_SLOTS: Array<{ start: string; end: string }> = [
    { start: '09:00', end: '10:00' }, // Period 1
    { start: '10:00', end: '11:00' }, // Period 2
    { start: '11:00', end: '12:00' }, // Period 3
    { start: '12:00', end: '13:00' }, // Period 4
    { start: '13:00', end: '14:00' }, // Lunch / Period 5
    { start: '14:00', end: '15:00' }, // Period 6
    { start: '15:00', end: '16:00' }, // Period 7
    { start: '16:00', end: '17:00' }, // Period 8
  ];

  /**
   * Normalizes arbitrary time header string (e.g., '9:00 - 10:00', '1:00 - 2:00 PM')
   * to standardized 24-hour HH:MM format.
   */
  public static normalizeTimeString(raw: string, fallbackIndex = 0): {
    startTime: string;
    endTime: string;
    label: string;
  } {
    const clean = raw.replace(/\s+/g, ' ').trim();

    // Match times like: 09:00 - 10:00, 9:00-10:00, 1:00 - 2:00, 12:00-1:00
    const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(?:AM|PM)?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i;
    const match = clean.match(timeRegex);

    if (match) {
      let startH = parseInt(match[1], 10);
      const startM = match[2] ? match[2] : '00';
      let endH = parseInt(match[3], 10);
      const endM = match[4] ? match[4] : '00';
      const periodMeridiem = match[5]?.toUpperCase();

      // Heuristic 12h to 24h conversion for university timetable hours
      // Slots starting at 1, 2, 3, 4, 5, 6 without AM are afternoon PM hours
      if (startH >= 1 && startH <= 6 && !clean.toLowerCase().includes('am')) {
        startH += 12;
      }
      if (endH >= 1 && endH <= 6 && !clean.toLowerCase().includes('am')) {
        endH += 12;
      }
      if (periodMeridiem === 'PM') {
        if (startH < 12) startH += 12;
        if (endH < 12) endH += 12;
      }

      const startTime = `${String(startH).padStart(2, '0')}:${startM}`;
      const endTime = `${String(endH).padStart(2, '0')}:${endM}`;
      return {
        startTime,
        endTime,
        label: `${startTime} - ${endTime}`,
      };
    }

    // Fallback to default NSUT period slot index
    const fallback =
      this.DEFAULT_TIME_SLOTS[fallbackIndex] ||
      this.DEFAULT_TIME_SLOTS[this.DEFAULT_TIME_SLOTS.length - 1];

    return {
      startTime: fallback.start,
      endTime: fallback.end,
      label: `${fallback.start} - ${fallback.end}`,
    };
  }

  /**
   * Normalizes day string to canonical DayOfWeek enum.
   */
  public static parseDayOfWeek(raw: string): DayOfWeek | null {
    const clean = raw.trim().toUpperCase();
    if (clean.startsWith('MON')) return 'Monday';
    if (clean.startsWith('TUE')) return 'Tuesday';
    if (clean.startsWith('WED')) return 'Wednesday';
    if (clean.startsWith('THU')) return 'Thursday';
    if (clean.startsWith('FRI')) return 'Friday';
    if (clean.startsWith('SAT')) return 'Saturday';
    return null;
  }

  /**
   * Parses text within a timetable cell into structured RawTimeSlot sessions.
   * Splits multi-group concurrent blocks (e.g. G1: Physics / G2: OOP) into separate sessions.
   */
  public static parseCellSessions(cellText: string): RawTimeSlot[] {
    const trimmed = cellText.trim();
    if (!trimmed || trimmed === '-' || trimmed === '.') {
      return [];
    }

    const upper = trimmed.toUpperCase();
    // Non-academic break markers
    if (
      upper.includes('LUNCH') ||
      upper.includes('BREAK') ||
      upper.includes('RECESS') ||
      upper.includes('SELF STUDY') ||
      upper.includes('NO CLASSES SCHEDULED') ||
      upper.includes('LIBRARY') ||
      upper.includes('SPORTS')
    ) {
      return [];
    }

    // Split candidates across explicit delimiters: '/' or distinct lines
    // Example: "G1: FCCS0102 (P) [Lab 1] / G2: FCEE0106 (P) [Lab 2]"
    const rawSegments = trimmed
      .split(/(?:\s*\/\s*|\n\r?|\r)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // If segments don't have course codes on each line, check if parent line has course code
    // Example: "FCMA0101 (T)" followed by "G1: Room 102 (Dr. Raman) / G2: Room 104 (Dr. Roy)"
    let sharedCourseCode: string | undefined;
    let sharedComponent: TimetableComponent | undefined;

    const firstCodeMatch = trimmed.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/);
    if (firstCodeMatch) {
      sharedCourseCode = firstCodeMatch[1];
    }
    if (upper.includes('(P)') || upper.includes('[P]') || upper.includes('LAB') || upper.includes('PRACTICAL')) {
      sharedComponent = 'Practical';
    } else if (upper.includes('(T)') || upper.includes('[T]') || upper.includes('TUT') || upper.includes('TUTORIAL')) {
      sharedComponent = 'Tutorial';
    } else if (upper.includes('(L)') || upper.includes('[L]') || upper.includes('LECTURE')) {
      sharedComponent = 'Lecture';
    }

    const sessions: RawTimeSlot[] = [];

    for (const segment of rawSegments) {
      const segUpper = segment.toUpperCase();
      if (
        segUpper === '-' ||
        segUpper.includes('LUNCH') ||
        segUpper.includes('BREAK') ||
        segUpper.includes('MENTOR') ||
        segUpper.includes('SPORTS') ||
        segUpper.includes('LIBRARY')
      ) {
        continue;
      }

      // 1. Course Code
      const codeMatch = segment.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/);
      const courseCode = codeMatch ? codeMatch[1] : sharedCourseCode;
      if (!courseCode) {
        // Skip if no course code can be mapped
        continue;
      }

      // 2. Component Type
      let component: TimetableComponent = sharedComponent || 'Lecture';
      if (segUpper.includes('(P)') || segUpper.includes('[P]') || segUpper.includes('LAB') || segUpper.includes('PRACTICAL')) {
        component = 'Practical';
      } else if (segUpper.includes('(T)') || segUpper.includes('[T]') || segUpper.includes('TUT') || segUpper.includes('TUTORIAL')) {
        component = 'Tutorial';
      } else if (segUpper.includes('(L)') || segUpper.includes('[L]') || segUpper.includes('LECTURE')) {
        component = 'Lecture';
      }

      // 3. Sub-Group / Batch
      let group = 'All';
      const groupMatch = segment.match(/\b(G[1-9]|Group\s*[-:]?\s*[1-9]|Batch\s*[-:]?\s*[A-Z\d]+|T[1-9]|B[1-9])\b/i);
      if (groupMatch) {
        const rawGroup = groupMatch[1].toUpperCase().replace(/\s+/g, '');
        if (rawGroup.startsWith('GROUP')) {
          group = `G${rawGroup.replace('GROUP', '').replace(/[-:]/g, '')}`;
        } else if (rawGroup.startsWith('BATCH')) {
          group = rawGroup;
        } else {
          group = rawGroup;
        }
      }

      // 4. Room / Venue Extraction
      let room = 'TBA';
      const roomMatch = segment.match(
        /\b(LT-?\s*\d+|Block-?\s*[A-Za-z\d]+(?:\s*(?:Room|Lab)?\s*\d+)?|Room\s*[-:]?\s*\d+|Lab\s*[-:]?\s*\d+|\[([^\]]+)\])\b/i
      );
      if (roomMatch) {
        room = (roomMatch[2] || roomMatch[1]).replace(/[\[\]]/g, '').trim();
      }

      // 5. Faculty Name Extraction
      let faculty = 'TBA';
      const facultyTitleMatch = segment.match(/(?:Prof\.|Dr\.|Mr\.|Ms\.)\s+[A-Za-z\.]+(?:\s+[A-Za-z\.]+)?/i);
      const facultyParenMatch = segment.match(/\(([A-Za-z\.\s]+)\)/);

      if (facultyTitleMatch) {
        faculty = facultyTitleMatch[0].trim();
      } else if (facultyParenMatch && !facultyParenMatch[1].match(/^(L|P|T)$/i)) {
        faculty = facultyParenMatch[1].trim();
      }

      sessions.push({
        courseCode,
        component,
        group,
        room,
        faculty,
        rawText: segment,
      });
    }

    return sessions;
  }

  /**
   * Parses legacy Plumware HTML timetable using 2D grid de-merger algorithm.
   */
  public static parseTimetable(html: string, options?: ParseTimetableOptions): MasterSectionTimetable {
    const $ = cheerio.load(html);

    // Metadata inference from page header
    const pageText = $('body').text();
    const academicYearMatch = pageText.match(/(?:Session|Year|Academic Session)\s*[-:]?\s*(\d{4}[-/]\d{2,4})/i);
    const programMatch = pageText.match(/(?:Program|Degree)\s*[-:]?\s*([A-Za-z\.\s]+?)(?:\||\n|<|$)/i);
    const branchMatch = pageText.match(/(?:Branch|Department)\s*[-:]?\s*([A-Za-z\s]+?)(?:\||\n|<|$)/i);
    const semesterMatch = pageText.match(/(?:Semester|Sem)\s*[-:]?\s*(\d)/i);
    const sectionMatch = pageText.match(/(?:Section|Sec)\s*[-:]?\s*([A-Za-z\d]+)/i);

    const academicYear = options?.academicYear || academicYearMatch?.[1] || '2026-27';
    const program = options?.program || programMatch?.[1]?.trim() || 'B.Tech';
    const branch = options?.branch || branchMatch?.[1]?.trim() || 'CSB';
    const semester = options?.semester || (semesterMatch ? parseInt(semesterMatch[1], 10) : 1);
    const section = options?.section || sectionMatch?.[1] || '1';

    // Locate the primary timetable grid table
    let targetTable: Cheerio<Element> | null = null;
    let maxCols = -1;

    const tables = $('table');
    for (let i = 0; i < tables.length; i++) {
      const table = tables.eq(i);
      const headerCount = table.find('tr').first().find('th, td').length;
      if (headerCount >= 4 && headerCount > maxCols) {
        maxCols = headerCount;
        targetTable = table;
      }
    }

    if (!targetTable) {
      logger.warn('TIMETABLE', 'Could not locate structured timetable table in HTML DOM.');
      return {
        academicYear,
        program,
        branch,
        semester,
        section,
        timeHeaders: [],
        grid: {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: [],
        },
        allSlots: [],
        scrapedAt: Date.now(),
      };
    }

    const rows = targetTable.find('tr');
    const timeHeaders: TimeSlotHeader[] = [];

    // Phase 1: Extract time slot column headers from the first row
    const firstRowCells = rows.first().find('th, td');
    let periodCounter = 0;

    for (let c = 0; c < firstRowCells.length; c++) {
      const cellText = $(firstRowCells[c]).text().trim();
      const lower = cellText.toLowerCase();

      // Skip the Day column header
      if (lower.includes('day') || lower.includes('period') && lower.includes('day')) {
        continue;
      }

      const normalized = this.normalizeTimeString(cellText, periodCounter);
      timeHeaders.push({
        periodIndex: periodCounter,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        label: normalized.label,
      });
      periodCounter++;
    }

    // Default headers fallback if no valid time headers found
    if (timeHeaders.length === 0) {
      for (let i = 0; i < this.DEFAULT_TIME_SLOTS.length; i++) {
        const slot = this.DEFAULT_TIME_SLOTS[i];
        timeHeaders.push({
          periodIndex: i,
          startTime: slot.start,
          endTime: slot.end,
          label: `${slot.start} - ${slot.end}`,
        });
      }
    }

    const numPeriods = timeHeaders.length;

    // Phase 2: 2D Matrix Grid Normalization (Handling colspan & rowspan)
    const grid: Record<DayOfWeek, (MasterTimetableSlot | null)[]> = {
      Monday: new Array(numPeriods).fill(null),
      Tuesday: new Array(numPeriods).fill(null),
      Wednesday: new Array(numPeriods).fill(null),
      Thursday: new Array(numPeriods).fill(null),
      Friday: new Array(numPeriods).fill(null),
      Saturday: new Array(numPeriods).fill(null),
    };

    // Track 2D occupancy across [day][col] to handle rowspan vertical spans
    const dayRowsList: DayOfWeek[] = [];
    const occupancyMap: Record<DayOfWeek, boolean[]> = {
      Monday: new Array(numPeriods).fill(false),
      Tuesday: new Array(numPeriods).fill(false),
      Wednesday: new Array(numPeriods).fill(false),
      Thursday: new Array(numPeriods).fill(false),
      Friday: new Array(numPeriods).fill(false),
      Saturday: new Array(numPeriods).fill(false),
    };

    const allSlots: MasterTimetableSlot[] = [];

    // Scan table data rows
    for (let r = 1; r < rows.length; r++) {
      const row = rows.eq(r);
      const cells = row.find('td, th');
      if (cells.length === 0) continue;

      // Identify day from first cell
      const firstCellText = cells.first().text();
      const currentDay = this.parseDayOfWeek(firstCellText);
      if (!currentDay) {
        continue;
      }

      dayRowsList.push(currentDay);
      const dayOccupancy = occupancyMap[currentDay];
      const dayGrid = grid[currentDay];

      let cellColPointer = 0;

      // Start from cell index 1 (skipping day label cell)
      for (let cellIdx = 1; cellIdx < cells.length; cellIdx++) {
        // Find next unoccupied column slot for this day
        while (cellColPointer < numPeriods && dayOccupancy[cellColPointer]) {
          cellColPointer++;
        }

        if (cellColPointer >= numPeriods) {
          break;
        }

        const cellEl = cells.eq(cellIdx);
        const colspan = Math.min(
          numPeriods - cellColPointer,
          parseInt(cellEl.attr('colspan') || '1', 10) || 1
        );
        const rowspan = parseInt(cellEl.attr('rowspan') || '1', 10) || 1;

        const cellText = cellEl.text().trim();
        const candidateSessions = this.parseCellSessions(cellText);

        if (candidateSessions.length > 0) {
          const startTime = timeHeaders[cellColPointer]?.startTime || '09:00';
          const endHeaderIdx = Math.min(numPeriods - 1, cellColPointer + colspan - 1);
          const endTime = timeHeaders[endHeaderIdx]?.endTime || '10:00';

          const slot: MasterTimetableSlot = {
            day: currentDay,
            startTime,
            endTime,
            periodIndex: cellColPointer,
            spanHours: colspan,
            candidateSessions,
          };

          allSlots.push(slot);

          // Populate grid across the spanned periods
          for (let spanOffset = 0; spanOffset < colspan; spanOffset++) {
            const targetCol = cellColPointer + spanOffset;
            if (targetCol < numPeriods) {
              dayGrid[targetCol] = slot;
            }
          }
        }

        // Mark 2D occupancy across colspan and rowspan
        for (let spanCol = 0; spanCol < colspan; spanCol++) {
          const targetCol = cellColPointer + spanCol;
          if (targetCol < numPeriods) {
            dayOccupancy[targetCol] = true;

            // Handle rowspan across future day rows if any
            if (rowspan > 1) {
              const currentDayIndex = DAYS_OF_WEEK.indexOf(currentDay);
              for (let spanRow = 1; spanRow < rowspan; spanRow++) {
                const nextDay = DAYS_OF_WEEK[currentDayIndex + spanRow];
                if (nextDay && occupancyMap[nextDay]) {
                  occupancyMap[nextDay][targetCol] = true;
                }
              }
            }
          }
        }

        cellColPointer += colspan;
      }
    }

    logger.debug(
      'TIMETABLE',
      `Parsed master timetable: ${allSlots.length} slot entries across ${dayRowsList.length} days`
    );

    return {
      academicYear,
      program,
      branch,
      semester,
      section,
      timeHeaders,
      grid,
      allSlots,
      scrapedAt: Date.now(),
    };
  }
}
