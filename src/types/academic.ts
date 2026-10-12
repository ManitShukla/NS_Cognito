import { z } from 'zod';

/**
 * Attendance status classification based on 75% university policy.
 */
export const AttendanceStatusSchema = z.enum(['SAFE', 'WARNING', 'CRITICAL']);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

/**
 * Parsed individual attendance cell token.
 */
export interface AttendanceCellToken {
  /** Original raw string from table cell (e.g., '1', '1+1', 'GH', '0+1') */
  rawToken: string;
  /** Effective number of classes conducted in this slot (0, 1, or 2) */
  classesHeld: number;
  /** Effective number of classes attended in this slot (0, 1, or 2) */
  classesAttended: number;
  /** Whether this slot is a Gazetted Holiday */
  isHoliday: boolean;
  /** Whether this slot was cancelled or rescheduled */
  isRescheduled: boolean;
}

/**
 * Footnote annotation extracted from Plumware table footers.
 */
export interface FootnoteRemark {
  courseCode?: string;
  date?: string;
  remarkText: string;
}

/**
 * Single date row across all enrolled courses in the attendance matrix.
 */
export interface AttendanceMatrixRecord {
  /** Formatted date string (e.g., '2026-08-11') */
  date: string;
  /** Day of the week (e.g., 'Tuesday') */
  dayOfWeek?: string;
  /** Attendance tokens keyed by course code (e.g., { 'FCCS0102': { ... } }) */
  courseTokens: Record<string, AttendanceCellToken>;
  /** Specific remarks associated with this date */
  remarks: string[];
}

/**
 * Integrity audit comparing calculated cell arithmetic against portal reported summaries.
 */
export interface SummaryIntegrityAudit {
  portalReported: {
    totalHeld: number;
    totalPresent: number;
    totalAbsent: number;
  };
  calculatedSum: {
    totalHeld: number;
    totalPresent: number;
    totalAbsent: number;
  };
  delta: {
    heldDelta: number;
    presentDelta: number;
    absentDelta: number;
  };
  hasDiscrepancy: boolean;
  warningMessage?: string;
}

/**
 * Complete academic attendance telemetry for a single course.
 */
export interface SubjectAttendance {
  /** Course identifier (e.g., 'FCCS0102') */
  courseCode: string;
  /** Course descriptive title (e.g., 'Object Oriented Programming') */
  courseName: string;
  /** Total classes held (excluding holidays and cancellations) */
  totalClasses: number;
  /** Total classes attended */
  present: number;
  /** Total classes absent */
  absent: number;
  /** Attendance percentage (0.00 to 100.00) */
  percentage: number;
  /** Safe bunk margin before dipping below 75% */
  bunkMargin: number;
  /** Minimum consecutive classes needed to restore attendance to 75% */
  classesNeededFor75: number;
  /** Academic standing category */
  status: AttendanceStatus;
  /** Relevant course-specific footnotes */
  remarks: FootnoteRemark[];
  /** Audit log verifying matrix integrity */
  integrityAudit: SummaryIntegrityAudit;
}

/**
 * Overall attendance aggregate across all enrolled courses.
 */
export interface OverallAttendanceSummary {
  totalHeld: number;
  totalPresent: number;
  totalAbsent: number;
  overallPercentage: number;
  overallBunkMargin: number;
  overallClassesNeededFor75: number;
  status: AttendanceStatus;
}

/**
 * Course component category.
 */
export type CourseComponentType = 'LECTURE' | 'TUTORIAL' | 'PRACTICAL' | 'OTHER';

/**
 * Course record from "Current Sem Courses Registered" view.
 */
export interface RegisteredCourse {
  courseCode: string;
  courseTitle: string;
  componentType: CourseComponentType;
  /** Group/Batch assignment (e.g., 'G1', 'G2', 'Batch-A', 'All') */
  group: string;
  credits?: number;
}

/**
 * Student's sub-group assignments mapping courses to specific lab/tutorial batches.
 */
export interface StudentGroupProfile {
  /** Primary sub-group (e.g., 'G1' or 'Batch-A') inferred from practical courses */
  defaultGroup: string;
  /** Explicit per-course group mappings (e.g., { 'FCCS0102': 'G1', 'FCEE0106': 'G2' }) */
  courseGroups: Record<string, string>;
  /** Granular component mappings keyed by `${courseCode}:${componentType}` (e.g., { 'FCCS0102:PRACTICAL': 'G1' }) for Phase 3 timetable resolution */
  componentGroups: Record<string, string>;
  /** Full list of registered course components */
  registeredCourses: RegisteredCourse[];
}

/**
 * Full student academic profile emitted by the telemetry coprocessor.
 */
export interface StudentAcademicProfile {
  rollNo: string;
  studentName?: string;
  program?: string;
  branch?: string;
  semester?: number;
  academicYear: string;
  overallSummary: OverallAttendanceSummary;
  subjects: SubjectAttendance[];
  groupProfile: StudentGroupProfile;
  attendanceRecords: AttendanceMatrixRecord[];
  lastUpdated: number;
}

// ==========================================
// ZOD VALIDATION SCHEMAS FOR PUBLIC CONTRACTS
// ==========================================

export const AttendanceCellTokenSchema = z.object({
  rawToken: z.string(),
  classesHeld: z.number().int().min(0).max(2),
  classesAttended: z.number().int().min(0).max(2),
  isHoliday: z.boolean(),
  isRescheduled: z.boolean(),
});

export const SubjectAttendanceSchema = z.object({
  courseCode: z.string().min(1),
  courseName: z.string().min(1),
  totalClasses: z.number().int().min(0),
  present: z.number().int().min(0),
  absent: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
  bunkMargin: z.number().int().min(0),
  classesNeededFor75: z.number().int().min(0),
  status: AttendanceStatusSchema,
});

export const RegisteredCourseSchema = z.object({
  courseCode: z.string().min(1),
  courseTitle: z.string().min(1),
  componentType: z.enum(['LECTURE', 'TUTORIAL', 'PRACTICAL', 'OTHER']),
  group: z.string().min(1),
  credits: z.number().optional(),
});
