import { z } from 'zod';

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const TIMETABLE_COMPONENTS = ['Lecture', 'Practical', 'Tutorial', 'Other'] as const;
export type TimetableComponent = (typeof TIMETABLE_COMPONENTS)[number];

/**
 * Atomic class session extracted from a raw timetable grid cell.
 */
export interface RawTimeSlot {
  courseCode: string;
  courseName?: string;
  component: TimetableComponent;
  /** Sub-group assignment (e.g. 'G1', 'G2', 'Batch-A', or 'All') */
  group: string;
  /** Venue/Room details (e.g. 'Block-IV 204', 'Circuits Lab') */
  room: string;
  /** Faculty name or abbreviation (e.g. 'Prof. Sharma', '(AK)') */
  faculty: string;
  /** Raw unparsed text preserved for audit integrity */
  rawText: string;
}

/**
 * Standard timetable period header specification.
 */
export interface TimeSlotHeader {
  periodIndex: number;
  startTime: string; // "09:00"
  endTime: string;   // "10:00"
  label: string;     // "09:00 - 10:00"
}

/**
 * Matrix cell representing a time block in the master section timetable.
 * Can hold multiple candidate sessions if concurrent split batches exist (e.g. G1 Lab & G2 Lab).
 */
export interface MasterTimetableSlot {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  periodIndex: number;
  spanHours: number; // 1 for single period, 2 for double lab block, etc.
  candidateSessions: RawTimeSlot[];
}

/**
 * Comprehensive master timetable for an entire academic section.
 */
export interface MasterSectionTimetable {
  academicYear: string;
  program: string;
  branch: string;
  semester: number;
  section: string;
  timeHeaders: TimeSlotHeader[];
  grid: Record<DayOfWeek, (MasterTimetableSlot | null)[]>;
  allSlots: MasterTimetableSlot[];
  scrapedAt: number;
  isCached?: boolean;
}

/**
 * Resolved chronological time slot tailored specifically to an individual student.
 */
export interface PersonalizedSlot {
  startTime: string;
  endTime: string;
  periodIndex: number;
  courseCode: string;
  courseName: string;
  component: TimetableComponent;
  group: string;
  room: string;
  faculty: string;
}

/**
 * Day schedule containing only student's actual commitments.
 */
export interface PersonalizedDaySchedule {
  day: DayOfWeek;
  slots: PersonalizedSlot[];
}

/**
 * Complete personalized academic weekly calendar.
 */
export interface PersonalizedStudentSchedule {
  rollNo: string;
  program: string;
  branch: string;
  semester: number;
  section: string;
  assignedGroup: string;
  schedule: Record<DayOfWeek, PersonalizedSlot[]>;
  totalWeeklyClasses: number;
  weeklyLectureHours: number;
  weeklyPracticalHours: number;
  weeklyTutorialHours: number;
  resolvedAt: number;
}

/**
 * Intelligence resolution extracted deterministically from roll number and system date.
 */
export interface StudentAcademicInference {
  rollNo: string;
  admissionYear: number;
  program: string;
  branchCode: string;
  branchName: string;
  currentSemester: number;
  academicYear: string;
  defaultSection: string;
  isEvenSemester: boolean;
  termLabel: string;
}

// ==========================================
// ZOD VALIDATION SCHEMAS FOR API CONTRACTS
// ==========================================

export const TimetableQuerySchema = z.object({
  program: z.string().default('B.Tech'),
  branch: z
    .string()
    .min(2, { message: 'Branch code is required.' })
    .max(15)
    .transform((val) => val.trim().toUpperCase()),
  semester: z.coerce.number().int().min(1).max(8).optional(),
  section: z.string().default('1').transform((val) => val.trim()),
  group: z.string().default('All').transform((val) => val.trim()),
});

export type TimetableQuery = z.infer<typeof TimetableQuerySchema>;

export const InferenceQuerySchema = z.object({
  rollNo: z
    .string()
    .min(3, { message: 'Roll number must be at least 3 characters.' })
    .max(30)
    .transform((val) => val.trim().toUpperCase()),
});

export type InferenceQuery = z.infer<typeof InferenceQuerySchema>;

export const TimetableSyncPayloadSchema = z.object({
  academicYear: z.string().optional(),
  program: z.string().default('B.Tech'),
  branch: z
    .string()
    .min(2)
    .max(15)
    .transform((val) => val.trim().toUpperCase()),
  semester: z.number().int().min(1).max(8),
  section: z.string().default('1').transform((val) => val.trim()),
});

export type TimetableSyncPayload = z.infer<typeof TimetableSyncPayloadSchema>;
