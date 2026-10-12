import type { StudentGroupProfile } from '../types/academic.js';
import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type MasterSectionTimetable,
  type PersonalizedSlot,
  type PersonalizedStudentSchedule,
  type RawTimeSlot,
} from '../types/timetable.js';
import { logger } from '../utils/logger.js';

export interface ResolveScheduleOptions {
  rollNo?: string;
  targetGroupOverride?: string;
}

/**
 * High-performance Sub-Batch Conflict Resolution Engine.
 * Cross-references complex master section grids with a student's enrolled course groups,
 * pruning conflicting batch labs and emitting a clean, personalized weekly schedule.
 */
export class ScheduleResolver {
  /**
   * Resolves a master section timetable against a student's enrolled group profile.
   */
  public static resolvePersonalizedSchedule(
    masterTimetable: MasterSectionTimetable,
    groupProfile: StudentGroupProfile,
    options?: ResolveScheduleOptions
  ): PersonalizedStudentSchedule {
    const rollNo = options?.rollNo || 'UNKNOWN';
    const effectiveDefaultGroup = (options?.targetGroupOverride || groupProfile.defaultGroup || 'G1').toUpperCase();

    const schedule: Record<DayOfWeek, PersonalizedSlot[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
    };

    let totalClasses = 0;
    let lectureHours = 0;
    let practicalHours = 0;
    let tutorialHours = 0;

    // Process all master slots
    for (const slot of masterTimetable.allSlots) {
      const matchingSession = this.selectMatchingSession(
        slot.candidateSessions,
        groupProfile,
        effectiveDefaultGroup
      );

      if (!matchingSession) {
        // Class is not for this student (e.g. different lab sub-batch)
        continue;
      }

      const durationHours = slot.spanHours || 1;

      const personalizedSlot: PersonalizedSlot = {
        startTime: slot.startTime,
        endTime: slot.endTime,
        periodIndex: slot.periodIndex,
        courseCode: matchingSession.courseCode,
        courseName: matchingSession.courseName || matchingSession.courseCode,
        component: matchingSession.component,
        group: matchingSession.group,
        room: matchingSession.room,
        faculty: matchingSession.faculty,
        spanHours: durationHours,
      };

      schedule[slot.day].push(personalizedSlot);
      totalClasses += 1;

      if (matchingSession.component === 'Lecture') {
        lectureHours += durationHours;
      } else if (matchingSession.component === 'Practical') {
        practicalHours += durationHours;
      } else if (matchingSession.component === 'Tutorial') {
        tutorialHours += durationHours;
      }
    }

    // Chronologically sort slots for each day by start time
    for (const day of DAYS_OF_WEEK) {
      schedule[day].sort((a, b) => {
        if (a.periodIndex !== b.periodIndex) {
          return a.periodIndex - b.periodIndex;
        }
        return a.startTime.localeCompare(b.startTime);
      });
    }

    logger.debug(
      'RESOLVER',
      `Resolved schedule for ${rollNo}: ${totalClasses} commitments (L: ${lectureHours}h, P: ${practicalHours}h, T: ${tutorialHours}h)`
    );

    return {
      rollNo,
      program: masterTimetable.program,
      branch: masterTimetable.branch,
      semester: masterTimetable.semester,
      section: masterTimetable.section,
      assignedGroup: effectiveDefaultGroup,
      schedule,
      totalWeeklyClasses: totalClasses,
      weeklyLectureHours: lectureHours,
      weeklyPracticalHours: practicalHours,
      weeklyTutorialHours: tutorialHours,
      resolvedAt: Date.now(),
    };
  }

  /**
   * Normalizes group identifiers (e.g. 'T1', 'B1', 'Group 1' -> 'G1').
   */
  private static normalizeGroup(group: string): string {
    const clean = group.toUpperCase().replace(/\s+/g, '');
    if (clean.startsWith('GROUP')) return `G${clean.replace('GROUP', '').replace(/[-:]/g, '')}`;
    if (clean.startsWith('BATCH')) return `G${clean.replace('BATCH', '').replace(/[-:]/g, '')}`;
    if (/^[TB]\d+$/.test(clean)) return `G${clean.slice(1)}`;
    return clean;
  }

  /**
   * Filters candidate sessions for a time slot down to the session matching the student's group
   * and registered elective enrollments.
   */
  private static selectMatchingSession(
    candidates: RawTimeSlot[],
    profile: StudentGroupProfile,
    effectiveDefaultGroup: string
  ): RawTimeSlot | null {
    if (candidates.length === 0) return null;

    // Handle Elective Course Mapping:
    // If the slot contains candidates for multiple distinct course codes (e.g., CS301 vs CS302),
    // and the student has registeredCourses listed, filter strictly to the student's enrolled course.
    let eligibleCandidates = candidates;
    const distinctCourseCodes = new Set(candidates.map((c) => c.courseCode.toUpperCase()));
    const hasMultipleElectives = distinctCourseCodes.size > 1;

    if (hasMultipleElectives && profile.registeredCourses && profile.registeredCourses.length > 0) {
      const registeredCodes = new Set(
        profile.registeredCourses.map((rc) => rc.courseCode.toUpperCase())
      );
      eligibleCandidates = candidates.filter((c) => registeredCodes.has(c.courseCode.toUpperCase()));

      // If student has registered courses but none match this elective slot, mark as free period (null)
      if (eligibleCandidates.length === 0) {
        return null;
      }
    }

    const normalizedDefaultGroup = this.normalizeGroup(effectiveDefaultGroup);

    for (const candidate of eligibleCandidates) {
      const candidateGroup = this.normalizeGroup(candidate.group);

      // 1. Universal Section-wide Lecture / Tutorial
      if (candidateGroup === 'ALL' || (candidate.component === 'Lecture' && candidateGroup === 'ALL')) {
        return candidate;
      }

      // 2. Exact match against granular component mapping (e.g. 'FCCS0102:PRACTICAL')
      const componentKey = `${candidate.courseCode}:${candidate.component.toUpperCase()}`;
      if (profile.componentGroups && profile.componentGroups[componentKey]) {
        const assignedGroup = this.normalizeGroup(profile.componentGroups[componentKey]);
        if (assignedGroup === candidateGroup || candidateGroup === 'ALL') {
          return candidate;
        }
        continue;
      }

      // 3. Match against course group mapping (e.g. 'FCCS0102')
      if (profile.courseGroups && profile.courseGroups[candidate.courseCode]) {
        const assignedGroup = this.normalizeGroup(profile.courseGroups[candidate.courseCode]);
        if (assignedGroup === candidateGroup || candidateGroup === 'ALL') {
          return candidate;
        }
        continue;
      }

      // 4. Match against student's effective default group (e.g. 'G1')
      if (candidateGroup === normalizedDefaultGroup) {
        return candidate;
      }
    }

    // If candidate list contains a single section-wide lecture without explicit group tag
    if (candidates.length === 1 && candidates[0].component === 'Lecture') {
      return candidates[0];
    }

    return null;
  }
}
