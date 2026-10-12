import type { StudentGroupProfile } from '../types/academic.js';
import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type MasterSectionTimetable,
  type MasterTimetableSlot,
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
   * Filters candidate sessions for a time slot down to the session matching the student's group.
   */
  private static selectMatchingSession(
    candidates: RawTimeSlot[],
    profile: StudentGroupProfile,
    effectiveDefaultGroup: string
  ): RawTimeSlot | null {
    if (candidates.length === 0) return null;

    for (const candidate of candidates) {
      const candidateGroup = candidate.group.toUpperCase().replace(/\s+/g, '');

      // 1. Universal Section-wide Lecture / Tutorial
      if (candidateGroup === 'ALL' || candidate.component === 'Lecture' && candidateGroup === 'ALL') {
        return candidate;
      }

      // 2. Exact match against granular component mapping (e.g. 'FCCS0102:PRACTICAL')
      const componentKey = `${candidate.courseCode}:${candidate.component.toUpperCase()}`;
      if (profile.componentGroups && profile.componentGroups[componentKey]) {
        const assignedGroup = profile.componentGroups[componentKey].toUpperCase().replace(/\s+/g, '');
        if (assignedGroup === candidateGroup || candidateGroup === 'ALL') {
          return candidate;
        }
        continue;
      }

      // 3. Match against course group mapping (e.g. 'FCCS0102')
      if (profile.courseGroups && profile.courseGroups[candidate.courseCode]) {
        const assignedGroup = profile.courseGroups[candidate.courseCode].toUpperCase().replace(/\s+/g, '');
        if (assignedGroup === candidateGroup || candidateGroup === 'ALL') {
          return candidate;
        }
        continue;
      }

      // 4. Match against student's effective default group (e.g. 'G1')
      if (candidateGroup === effectiveDefaultGroup) {
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
