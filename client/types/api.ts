export type AttendanceStatus = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface AttendanceCellToken {
  rawToken: string;
  classesHeld: number;
  classesAttended: number;
  isHoliday: boolean;
  isRescheduled: boolean;
}

export interface FootnoteRemark {
  courseCode?: string;
  date?: string;
  remarkText: string;
}

export interface AttendanceMatrixRecord {
  date: string;
  dayOfWeek?: string;
  courseTokens: Record<string, AttendanceCellToken>;
  remarks: string[];
}

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

export interface SubjectAttendance {
  courseCode: string;
  courseName: string;
  totalClasses: number;
  present: number;
  absent: number;
  percentage: number;
  bunkMargin: number;
  classesNeededFor75: number;
  status: AttendanceStatus;
  remarks: FootnoteRemark[];
  integrityAudit: SummaryIntegrityAudit;
}

export interface OverallAttendanceSummary {
  totalHeld: number;
  totalPresent: number;
  totalAbsent: number;
  overallPercentage: number;
  overallBunkMargin: number;
  overallClassesNeededFor75: number;
  status: AttendanceStatus;
}

export type CourseComponentType = 'LECTURE' | 'TUTORIAL' | 'PRACTICAL' | 'OTHER';

export interface RegisteredCourse {
  courseCode: string;
  courseTitle: string;
  componentType: CourseComponentType;
  group: string;
  credits?: number;
}

export interface StudentGroupProfile {
  defaultGroup: string;
  courseGroups: Record<string, string>;
  componentGroups: Record<string, string>;
  registeredCourses: RegisteredCourse[];
}

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

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type TimetableComponent = 'Lecture' | 'Practical' | 'Tutorial' | 'Other';

export interface RawTimeSlot {
  courseCode: string;
  courseName?: string;
  component: TimetableComponent;
  group: string;
  room: string;
  faculty: string;
  rawText: string;
}

export interface TimeSlotHeader {
  periodIndex: number;
  startTime: string;
  endTime: string;
  label: string;
}

export interface MasterTimetableSlot {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  periodIndex: number;
  spanHours: number;
  candidateSessions: RawTimeSlot[];
}

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
  spanHours?: number;
}

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

export type ForecastAction = 'ATTEND' | 'BUNK' | 'UNCONDUCTED';

export interface ProjectedCourseMetric {
  courseCode: string;
  courseName: string;
  classesScheduledToday: number;
  totalWeightHours: number;
  action: ForecastAction;
  currentHeld: number;
  currentPresent: number;
  currentPercentage: number;
  currentBunkMargin: number;
  projectedHeld: number;
  projectedPresent: number;
  projectedPercentage: number;
  projectedBunkMargin: number;
  classesNeededFor75: number;
  deltaPercentage: number;
  status: AttendanceStatus;
}

export interface ProjectedAttendanceForecast {
  targetDay: DayOfWeek;
  totalCommitmentsToday: number;
  totalScheduledHours: number;
  courses: ProjectedCourseMetric[];
  currentOverall: {
    totalHeld: number;
    totalPresent: number;
    percentage: number;
    bunkMargin: number;
    status: AttendanceStatus;
  };
  projectedOverall: {
    totalHeld: number;
    totalPresent: number;
    percentage: number;
    bunkMargin: number;
    deltaPercentage: number;
    status: AttendanceStatus;
  };
  forecastGeneratedAt: number;
}

export interface SessionInitData {
  sessionToken: string;
  captchaBase64: string;
  academicYear: string;
  expiresInSeconds: number;
  timestamp: number;
}

export interface LoginSuccessData {
  sessionToken: string;
  rollNo: string;
  academicYear: string;
  authenticatedAt: number;
  message: string;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}
