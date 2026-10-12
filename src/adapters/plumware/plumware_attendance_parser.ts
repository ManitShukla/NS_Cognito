import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import type {
  AttendanceCellToken,
  AttendanceMatrixRecord,
  FootnoteRemark,
  RegisteredCourse,
  CourseComponentType,
  StudentGroupProfile,
} from '../../types/academic.js';
import { logger } from '../../utils/logger.js';

export interface ParsedAttendanceMatrixData {
  courseHeaders: { code: string; name?: string; columnIndex: number }[];
  records: AttendanceMatrixRecord[];
  portalSummaries: Record<string, { totalHeld: number; totalPresent: number; totalAbsent: number }>;
  footnotes: FootnoteRemark[];
}

/**
 * Resilient DOM ingestion parser for Plumware attendance sheets
 * and student course registration rosters.
 */
export class PlumwareAttendanceParser {
  /**
   * Parses raw token string from an individual table cell into standardized attendance metrics.
   */
  public static parseCellToken(rawText: string): AttendanceCellToken {
    const clean = rawText.trim().toUpperCase().replace(/\s+/g, '');

    // Default empty / not held
    if (!clean || clean === '-' || clean === 'NA' || clean === 'N/A' || clean === '.') {
      return {
        rawToken: rawText.trim(),
        classesHeld: 0,
        classesAttended: 0,
        isHoliday: false,
        isRescheduled: false,
      };
    }

    // Pure Holiday / Rescheduled indicators
    if (clean === 'GH' || clean === 'GH+GH' || clean === 'H' || clean === 'HOLIDAY') {
      return {
        rawToken: rawText.trim(),
        classesHeld: 0,
        classesAttended: 0,
        isHoliday: true,
        isRescheduled: false,
      };
    }

    if (clean === 'CR' || clean === 'CR+CR' || clean === 'CANCELLED' || clean === 'RESCHEDULED') {
      return {
        rawToken: rawText.trim(),
        classesHeld: 0,
        classesAttended: 0,
        isHoliday: false,
        isRescheduled: true,
      };
    }

    // Compound double-block attendance tokens: 1+1, 1+0, 0+1, 0+0
    if (clean.includes('+')) {
      const parts = clean.split('+');
      let held = 0;
      let attended = 0;
      let isHoliday = false;
      let isRescheduled = false;

      for (const part of parts) {
        if (part === '1') {
          held += 1;
          attended += 1;
        } else if (part === '0') {
          held += 1;
        } else if (part === 'GH' || part === 'H') {
          isHoliday = true;
        } else if (part === 'CR') {
          isRescheduled = true;
        }
      }

      return {
        rawToken: rawText.trim(),
        classesHeld: held,
        classesAttended: attended,
        isHoliday,
        isRescheduled,
      };
    }

    // Single block tokens: 1 (Present), 0 (Absent)
    if (clean === '1' || clean === 'P' || clean === 'PRESENT') {
      return {
        rawToken: rawText.trim(),
        classesHeld: 1,
        classesAttended: 1,
        isHoliday: false,
        isRescheduled: false,
      };
    }

    if (clean === '0' || clean === 'A' || clean === 'ABSENT') {
      return {
        rawToken: rawText.trim(),
        classesHeld: 1,
        classesAttended: 0,
        isHoliday: false,
        isRescheduled: false,
      };
    }

    // Fallback: Numeric integer
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num >= 0 && num <= 2) {
      return {
        rawToken: rawText.trim(),
        classesHeld: num > 0 ? num : 1,
        classesAttended: num,
        isHoliday: false,
        isRescheduled: false,
      };
    }

    return {
      rawToken: rawText.trim(),
      classesHeld: 0,
      classesAttended: 0,
      isHoliday: false,
      isRescheduled: false,
    };
  }

  /**
   * Ingests the complex, irregular Plumware attendance HTML matrix table.
   */
  public static parseAttendanceMatrix(html: string): ParsedAttendanceMatrixData {
    const $ = cheerio.load(html);

    // Extract Footnotes first (lines like FCCS0102--->03-08-2026--->NA-CLASSES WERE NOT STARTED)
    const footnotes = this.extractFootnotes($, html);

    // Find the primary data table (look for table containing headers or date patterns)
    let targetTable: Cheerio<Element> | null = null;
    let bestScore = -1;

    const tables = $('table');
    for (let i = 0; i < tables.length; i++) {
      const table = tables.eq(i);
      const text = table.text();
      let score = 0;
      if (text.includes('Total Classes') || text.includes('Total Present')) score += 5;
      if (text.match(/[A-Z]{2,4}\d{4}/)) score += 5; // Subject codes e.g. FCCS0102
      if (text.match(/\d{1,2}[-/][A-Za-z]{3}|\d{1,2}[-/]\d{1,2}/)) score += 3; // Date formats
      if (score > bestScore) {
        bestScore = score;
        targetTable = table;
      }
    }

    if (!targetTable || bestScore <= 0) {
      logger.warn('PARSER', 'Could not locate structured attendance table in Plumware payload.');
      return {
        courseHeaders: [],
        records: [],
        portalSummaries: {},
        footnotes,
      };
    }

    const rows = targetTable.find('tr');
    const courseHeaders: { code: string; name?: string; columnIndex: number }[] = [];
    const portalSummaries: Record<string, { totalHeld: number; totalPresent: number; totalAbsent: number }> = {};
    const records: AttendanceMatrixRecord[] = [];

    let headerRowIndex = -1;
    let dateColumnIndex = 0;
    let dayColumnIndex = -1;

    // Phase 1: Identify Course Headers
    rows.each((rowIndex: number, row: Element) => {
      if (headerRowIndex !== -1) return;

      const cells = $(row).find('th, td');
      const detectedHeaders: { code: string; name?: string; columnIndex: number }[] = [];

      cells.each((colIndex: number, cell: Element) => {
        const text = $(cell).text().trim();
        // Match course code pattern: e.g. FCCS0102, CS101, IT202, etc.
        const codeMatch = text.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/);

        if (codeMatch) {
          const code = codeMatch[1];
          const title = $(cell).attr('title') || text.replace(code, '').replace(/[\(\)\-:]/g, ' ').trim();
          detectedHeaders.push({
            code,
            name: title.length > 0 ? title : undefined,
            columnIndex: colIndex,
          });
        } else if (text.toLowerCase() === 'date' || text.toLowerCase().includes('date')) {
          dateColumnIndex = colIndex;
        } else if (text.toLowerCase() === 'day') {
          dayColumnIndex = colIndex;
        }
      });

      if (detectedHeaders.length > 0) {
        headerRowIndex = rowIndex;
        courseHeaders.push(...detectedHeaders);
      }
    });

    // Phase 2: Ingest Data Rows and Summary Rows
    rows.each((rowIndex: number, row: Element) => {
      if (rowIndex <= headerRowIndex) return;

      const cells = $(row).find('td, th');
      if (cells.length === 0) return;

      const rowText = $(row).text().toLowerCase();

      const expandedCells = this.expandRowCells($, $(row));

      // Check for bottom summary rows
      if (rowText.includes('total classes') || rowText.includes('total held')) {
        this.extractSummaryRowValues($, $(row), courseHeaders, portalSummaries, 'held');
        return;
      }
      if (rowText.includes('total present') || rowText.includes('classes attended')) {
        this.extractSummaryRowValues($, $(row), courseHeaders, portalSummaries, 'present');
        return;
      }
      if (rowText.includes('total absent') || rowText.includes('classes absent')) {
        this.extractSummaryRowValues($, $(row), courseHeaders, portalSummaries, 'absent');
        return;
      }
      if (rowText.includes('percentage') || rowText.includes('%')) {
        // Skip percentage summary row
        return;
      }

      // Check if this row is a valid date record
      const dateCell = expandedCells[dateColumnIndex];
      const dateCellText = dateCell ? $(dateCell).text().trim() : '';
      const isDate =
        dateCellText.match(/\b\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]?\d{0,4}\b/) ||
        dateCellText.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{1,2}\b/i);

      if (!isDate) {
        // Not a date row (could be empty spacer or nested sub-header)
        return;
      }

      const dayCell = dayColumnIndex !== -1 ? expandedCells[dayColumnIndex] : undefined;
      const dayText = dayCell ? $(dayCell).text().trim() : undefined;
      const courseTokens: Record<string, AttendanceCellToken> = {};

      for (const header of courseHeaders) {
        const cell = expandedCells[header.columnIndex];
        const rawCellText = cell ? $(cell).text().trim() : '';
        courseTokens[header.code] = this.parseCellToken(rawCellText);
      }

      records.push({
        date: dateCellText,
        dayOfWeek: dayText,
        courseTokens,
        remarks: [],
      });
    });

    logger.debug('PARSER', `Parsed attendance matrix: ${courseHeaders.length} subjects, ${records.length} date entries`);

    return {
      courseHeaders,
      records,
      portalSummaries,
      footnotes,
    };
  }

  /**
   * Expands cells containing colspan into a flat normalized array aligned to column indices.
   */
  private static expandRowCells($: cheerio.CheerioAPI, row: Cheerio<Element>): Cheerio<Element>[] {
    const expanded: Cheerio<Element>[] = [];
    row.find('th, td').each((_, cell) => {
      const el = $(cell);
      const colspan = parseInt(el.attr('colspan') || '1', 10) || 1;
      for (let i = 0; i < colspan; i++) {
        expanded.push(el);
      }
    });
    return expanded;
  }

  /**
   * Helper extracting reported values from summary row cells.
   */
  private static extractSummaryRowValues(
    $: cheerio.CheerioAPI,
    row: Cheerio<Element>,
    headers: { code: string; columnIndex: number }[],
    portalSummaries: Record<string, { totalHeld: number; totalPresent: number; totalAbsent: number }>,
    type: 'held' | 'present' | 'absent'
  ): void {
    const cells = this.expandRowCells($, row);

    for (const header of headers) {
      if (!portalSummaries[header.code]) {
        portalSummaries[header.code] = { totalHeld: 0, totalPresent: 0, totalAbsent: 0 };
      }

      const cell = cells[header.columnIndex];
      if (cell) {
        const val = parseInt($(cell).text().trim(), 10);
        if (!isNaN(val)) {
          if (type === 'held') portalSummaries[header.code].totalHeld = val;
          if (type === 'present') portalSummaries[header.code].totalPresent = val;
          if (type === 'absent') portalSummaries[header.code].totalAbsent = val;
        }
      }
    }
  }

  /**
   * Extracts footnote logs like: FCCS0102--->03-08-2026--->NA-CLASSES WERE NOT STARTED
   */
  private static extractFootnotes($: cheerio.CheerioAPI, html: string): FootnoteRemark[] {
    const remarks: FootnoteRemark[] = [];

    // Regex for Plumware arrow footnote pattern: CODE--->DATE--->REMARK
    const arrowMatches = html.matchAll(/([A-Z]{2,5}\d{3,5})--+>(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|[A-Za-z]{3}\s*\d{1,2})--+>([^\r\n<]+)/g);
    for (const match of arrowMatches) {
      remarks.push({
        courseCode: match[1],
        date: match[2],
        remarkText: match[3].trim(),
      });
    }

    // Inspect trailing paragraph or list remarks
    $('p, font, li').each((_, el) => {
      const text = $(el).text().trim();
      if (text.startsWith('*') || text.toLowerCase().startsWith('remarks:') || text.toLowerCase().startsWith('note:')) {
        if (!text.includes('--->')) {
          remarks.push({
            remarkText: text,
          });
        }
      }
    });

    return remarks;
  }

  /**
   * Ingests the "Current Sem Courses Registered" view into structured group profiles.
   */
  public static parseRegisteredCourses(html: string): StudentGroupProfile {
    const $ = cheerio.load(html);
    const registeredCourses: RegisteredCourse[] = [];
    const courseGroups: Record<string, string> = {};
    const componentGroups: Record<string, string> = {};
    const groupFrequency = new Map<string, number>();

    // Locate the courses registration table
    let targetTable: Cheerio<Element> | null = null;
    let maxRows = -1;

    const tables = $('table');
    for (let i = 0; i < tables.length; i++) {
      const table = tables.eq(i);
      const text = table.text().toLowerCase();
      if (text.includes('course code') || text.includes('course title') || text.includes('batch') || text.includes('group')) {
        const rowCount = table.find('tr').length;
        if (rowCount > maxRows) {
          maxRows = rowCount;
          targetTable = table;
        }
      }
    }

    if (targetTable) {
      const rows = targetTable.find('tr');
      let codeCol = -1;
      let titleCol = -1;
      let typeCol = -1;
      let groupCol = -1;
      let creditsCol = -1;

      rows.each((_: number, row: Element) => {
        const cells = $(row).find('th, td');

        // Look for header row
        if (codeCol === -1) {
          cells.each((idx: number, cell: Element) => {
            const hText = $(cell).text().trim().toLowerCase();
            if (hText.includes('code') || hText.includes('sub code')) codeCol = idx;
            if (hText.includes('title') || hText.includes('name') || hText.includes('subject')) titleCol = idx;
            if (hText.includes('type') || hText.includes('comp')) typeCol = idx;
            if (hText.includes('group') || hText.includes('batch') || hText.includes('sec')) groupCol = idx;
            if (hText.includes('credit') || hText.includes('cr')) creditsCol = idx;
          });
          return;
        }

        // Data rows
        if (cells.length > Math.max(codeCol, titleCol)) {
          const rawCode = $(cells[codeCol]).text().trim();
          const codeMatch = rawCode.match(/\b([A-Z]{2,5}\d{3,5}[A-Z]?)\b/);

          if (codeMatch) {
            const courseCode = codeMatch[1];
            const courseTitle = titleCol !== -1 ? $(cells[titleCol]).text().trim() : courseCode;
            const rawType = typeCol !== -1 ? $(cells[typeCol]).text().trim().toUpperCase() : 'L';
            const rawGroup = groupCol !== -1 ? $(cells[groupCol]).text().trim() : 'All';
            const creditsVal = creditsCol !== -1 ? parseFloat($(cells[creditsCol]).text().trim()) : undefined;

            let componentType: CourseComponentType = 'LECTURE';
            if (rawType.startsWith('P') || rawType.includes('LAB') || rawType.includes('PRAC')) {
              componentType = 'PRACTICAL';
            } else if (rawType.startsWith('T') || rawType.includes('TUT')) {
              componentType = 'TUTORIAL';
            }

            const cleanGroup = rawGroup.length > 0 ? rawGroup : 'All';

            registeredCourses.push({
              courseCode,
              courseTitle: courseTitle.length > 0 ? courseTitle : courseCode,
              componentType,
              group: cleanGroup,
              credits: !isNaN(creditsVal as number) ? creditsVal : undefined,
            });

            courseGroups[courseCode] = cleanGroup;
            componentGroups[`${courseCode}:${componentType}`] = cleanGroup;

            // Track practical group frequency to establish default group
            if (componentType === 'PRACTICAL' && cleanGroup !== 'All') {
              groupFrequency.set(cleanGroup, (groupFrequency.get(cleanGroup) || 0) + 1);
            }
          }
        }
      });
    }

    // Determine default group: the most common sub-group among practical labs, or fallback to first or 'G1'
    let defaultGroup = 'G1';
    let highestCount = 0;

    for (const [grp, count] of groupFrequency.entries()) {
      if (count > highestCount) {
        highestCount = count;
        defaultGroup = grp;
      }
    }

    if (highestCount === 0 && Object.keys(courseGroups).length > 0) {
      // Find first non-'All' group
      const firstNonAll = Object.values(courseGroups).find((g) => g !== 'All');
      if (firstNonAll) defaultGroup = firstNonAll;
    }

    logger.debug('PARSER', `Parsed registered courses: ${registeredCourses.length} entries, default group: ${defaultGroup}`);

    return {
      defaultGroup,
      courseGroups,
      componentGroups,
      registeredCourses,
    };
  }
}
