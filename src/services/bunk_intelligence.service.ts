import type {
  SubjectAttendance,
  OverallAttendanceSummary,
  AttendanceStatus,
  SummaryIntegrityAudit,
  FootnoteRemark,
  AttendanceMatrixRecord,
} from '../types/academic.js';

export interface RawSubjectMetrics {
  courseCode: string;
  courseName?: string;
  totalHeld: number;
  totalPresent: number;
  totalAbsent: number;
  portalReportedSummary?: {
    totalHeld: number;
    totalPresent: number;
    totalAbsent: number;
  };
  remarks?: FootnoteRemark[];
}

/**
 * Pure mathematical domain engine for NSUT attendance analytics.
 * Implements strict cutoff calculations (75% policy), safe bunk forecasting,
 * deficit recovery requirements, and summary audit verification.
 */
export class BunkIntelligenceService {
  /** Mandatory university cutoff threshold */
  public static readonly CUTOFF_THRESHOLD = 0.75;
  /** Safe threshold boundary for green status */
  public static readonly SAFE_THRESHOLD = 0.80;

  /**
   * Computes attendance percentage safely to two decimal places.
   * If no classes have been conducted yet, defaults to 100.0%.
   */
  public static computePercentage(present: number, held: number): number {
    if (held <= 0) {
      return 100.0;
    }
    const raw = (present / held) * 100;
    return Math.round(raw * 100) / 100;
  }

  /**
   * Calculates the Safe Bunk Margin: how many upcoming consecutive classes
   * a student can skip without their attendance falling below 75%.
   *
   * Algebraic Proof:
   *   (Present) / (Held + b) >= 3/4
   *   <=> 4 * Present >= 3 * Held + 3 * b
   *   <=> 3 * b <= 4 * Present - 3 * Held
   *   <=> b <= (4 * Present - 3 * Held) / 3
   *   b_max = floor((4 * Present - 3 * Held) / 3)
   */
  public static computeBunkMargin(present: number, held: number): number {
    if (held <= 0) {
      return 0;
    }
    const diff = 4 * present - 3 * held;
    if (diff <= 0) {
      return 0;
    }
    return Math.floor(diff / 3);
  }

  /**
   * Calculates the Recovery Requirement: how many upcoming consecutive classes
   * a student must attend to restore attendance to at least 75%.
   *
   * Algebraic Proof:
   *   (Present + r) / (Held + r) >= 3/4
   *   <=> 4 * Present + 4 * r >= 3 * Held + 3 * r
   *   <=> r >= 3 * Held - 4 * Present
   *   Since Held and Present are integers, (3 * Held - 4 * Present) is an exact integer:
   *   r_min = max(0, 3 * Held - 4 * Present)
   */
  public static computeClassesNeeded(present: number, held: number): number {
    if (held <= 0) {
      return 0;
    }
    const needed = 3 * held - 4 * present;
    if (needed <= 0) {
      return 0;
    }
    return needed;
  }

  /**
   * Categorizes academic standing into SAFE, WARNING, or CRITICAL.
   */
  public static classifyStatus(percentage: number): AttendanceStatus {
    if (percentage >= this.SAFE_THRESHOLD * 100) {
      return 'SAFE';
    }
    if (percentage >= this.CUTOFF_THRESHOLD * 100) {
      return 'WARNING';
    }
    return 'CRITICAL';
  }

  /**
   * Performs an independent arithmetic audit comparing daily cell sums
   * against the portal's reported bottom summary rows.
   */
  public static auditIntegrity(
    calculated: { totalHeld: number; totalPresent: number; totalAbsent: number },
    portalReported?: { totalHeld: number; totalPresent: number; totalAbsent: number }
  ): SummaryIntegrityAudit {
    const fallbackReported = portalReported || { ...calculated };

    const heldDelta = calculated.totalHeld - fallbackReported.totalHeld;
    const presentDelta = calculated.totalPresent - fallbackReported.totalPresent;
    const absentDelta = calculated.totalAbsent - fallbackReported.totalAbsent;

    const hasDiscrepancy = heldDelta !== 0 || presentDelta !== 0 || absentDelta !== 0;

    let warningMessage: string | undefined;
    if (hasDiscrepancy) {
      warningMessage =
        `Portal summary mismatch: Portal reported ${fallbackReported.totalHeld} held / ` +
        `${fallbackReported.totalPresent} present, but sum of dates yields ` +
        `${calculated.totalHeld} held / ${calculated.totalPresent} present.`;
    }

    return {
      portalReported: fallbackReported,
      calculatedSum: calculated,
      delta: {
        heldDelta,
        presentDelta,
        absentDelta,
      },
      hasDiscrepancy,
      warningMessage,
    };
  }

  /**
   * Computes normalized attendance telemetry for a single course.
   */
  public static processSubject(metrics: RawSubjectMetrics): SubjectAttendance {
    const { courseCode, courseName, totalHeld, totalPresent, totalAbsent, portalReportedSummary, remarks } =
      metrics;

    const percentage = this.computePercentage(totalPresent, totalHeld);
    const bunkMargin = this.computeBunkMargin(totalPresent, totalHeld);
    const classesNeededFor75 = this.computeClassesNeeded(totalPresent, totalHeld);
    const status = this.classifyStatus(percentage);

    const integrityAudit = this.auditIntegrity(
      { totalHeld, totalPresent, totalAbsent },
      portalReportedSummary
    );

    return {
      courseCode,
      courseName: courseName || courseCode,
      totalClasses: totalHeld,
      present: totalPresent,
      absent: totalAbsent,
      percentage,
      bunkMargin,
      classesNeededFor75,
      status,
      remarks: remarks || [],
      integrityAudit,
    };
  }

  /**
   * Calculates subjects and overall summary directly from parsed matrix date records.
   */
  public static processMatrix(
    courseHeaders: { code: string; name?: string }[],
    records: AttendanceMatrixRecord[],
    portalReportedSummaries?: Record<string, { totalHeld: number; totalPresent: number; totalAbsent: number }>,
    footnotes?: FootnoteRemark[]
  ): { subjects: SubjectAttendance[]; overallSummary: OverallAttendanceSummary } {
    const subjectMetricsMap = new Map<string, { held: number; present: number; absent: number }>();

    for (const header of courseHeaders) {
      subjectMetricsMap.set(header.code, { held: 0, present: 0, absent: 0 });
    }

    // Accumulate classes across all dates
    for (const record of records) {
      for (const [courseCode, token] of Object.entries(record.courseTokens)) {
        const metrics = subjectMetricsMap.get(courseCode);
        if (metrics) {
          metrics.held += token.classesHeld;
          metrics.present += token.classesAttended;
          metrics.absent += token.classesHeld - token.classesAttended;
        }
      }
    }

    const subjects: SubjectAttendance[] = [];

    for (const header of courseHeaders) {
      const metrics = subjectMetricsMap.get(header.code) || { held: 0, present: 0, absent: 0 };
      const reportedSummary = portalReportedSummaries ? portalReportedSummaries[header.code] : undefined;
      const courseRemarks = footnotes ? footnotes.filter((f) => !f.courseCode || f.courseCode === header.code) : [];

      const subject = this.processSubject({
        courseCode: header.code,
        courseName: header.name || header.code,
        totalHeld: metrics.held,
        totalPresent: metrics.present,
        totalAbsent: metrics.absent,
        portalReportedSummary: reportedSummary,
        remarks: courseRemarks,
      });

      subjects.push(subject);
    }

    const overallSummary = this.calculateOverallSummary(subjects);

    return {
      subjects,
      overallSummary,
    };
  }

  /**
   * Synthesizes overall aggregate attendance metrics across all enrolled courses.
   */
  public static calculateOverallSummary(subjects: SubjectAttendance[]): OverallAttendanceSummary {
    let totalHeld = 0;
    let totalPresent = 0;
    let totalAbsent = 0;

    for (const subject of subjects) {
      totalHeld += subject.totalClasses;
      totalPresent += subject.present;
      totalAbsent += subject.absent;
    }

    const overallPercentage = this.computePercentage(totalPresent, totalHeld);
    const overallBunkMargin = this.computeBunkMargin(totalPresent, totalHeld);
    const overallClassesNeededFor75 = this.computeClassesNeeded(totalPresent, totalHeld);
    const status = this.classifyStatus(overallPercentage);

    return {
      totalHeld,
      totalPresent,
      totalAbsent,
      overallPercentage,
      overallBunkMargin,
      overallClassesNeededFor75,
      status,
    };
  }
}
