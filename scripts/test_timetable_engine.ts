import fs from 'fs';
import path from 'path';
import { PlumwareTimetableParser } from '../src/adapters/plumware/plumware_timetable_parser.js';
import { PlumwareAttendanceParser } from '../src/adapters/plumware/plumware_attendance_parser.js';
import { TimetableInferenceService } from '../src/services/timetable_inference.service.js';
import { ScheduleResolver } from '../src/services/schedule_resolver.service.js';
import { DAYS_OF_WEEK } from '../src/types/timetable.js';

/**
 * NS COGNITO // CLI TIMETABLE & SCHEDULING COPROCESSOR HARNESS
 * Demonstrates 2D matrix de-merger, roll number inference, and conflict-free schedule resolution
 * formatted according to the Swiss Editorial Telemetry specification.
 */
function runTimetableDemo() {
  console.log('========================================================================================');
  console.log('                 NS COGNITO // TIMETABLE COPROCESSOR & INFERENCE ENGINE                 ');
  console.log('              SWISS EDITORIAL LAYOUT × 2D MATRIX RESOLUTION & SUB-BATCH LOGIC           ');
  console.log('========================================================================================\n');

  const fixtureDir = path.resolve(process.cwd(), 'tests', 'fixtures');
  const timetableHtml = fs.readFileSync(path.join(fixtureDir, 'master_timetable_csb.html'), 'utf-8');
  const coursesHtml = fs.readFileSync(path.join(fixtureDir, 'courses_registered.html'), 'utf-8');

  // 1. Smart Academic Inference from Roll Number
  const sampleRoll = '2024UCB1234';
  const oct2026 = new Date(2026, 9, 12);
  const inference = TimetableInferenceService.inferFromRollNumber(sampleRoll, oct2026);

  console.log('01 // SMART_ACADEMIC_INFERENCE            ROLL :: ' + inference.rollNo);
  console.log('----------------------------------------------------------------------------------------');
  console.log(`PROGRAM                  :: ${inference.program}`);
  console.log(`ADMISSION YEAR           :: ${inference.admissionYear}`);
  console.log(`BRANCH CODE & TITLE      :: ${inference.branchCode} — ${inference.branchName}`);
  console.log(`CALCULATED SEMESTER      :: Semester ${inference.currentSemester} (${inference.termLabel})`);
  console.log(`ACADEMIC YEAR            :: ${inference.academicYear}`);
  console.log(`INFERRED SECTION         :: Section ${inference.defaultSection}`);
  console.log('----------------------------------------------------------------------------------------\n');

  // 2. Parse Master Timetable HTML with 2D Grid De-merger
  const masterTimetable = PlumwareTimetableParser.parseTimetable(timetableHtml, {
    program: inference.program,
    branch: inference.branchCode,
    semester: inference.currentSemester,
    section: inference.defaultSection,
  });

  console.log('02 // MASTER_SECTION_GRID_NORMALIZATION    TIME PERIODS :: ' + masterTimetable.timeHeaders.length);
  console.log('----------------------------------------------------------------------------------------');
  console.log('PERIOD | TIME WINDOW   | MON SLOTS | TUE SLOTS | WED SLOTS | THU SLOTS | FRI SLOTS');
  console.log('-------+---------------+-----------+-----------+-----------+-----------+------------');

  for (let p = 0; p < masterTimetable.timeHeaders.length; p++) {
    const hdr = masterTimetable.timeHeaders[p];
    const pIdx = `P${p + 1}`.padEnd(6);
    const win = `${hdr.startTime}-${hdr.endTime}`.padEnd(13);

    const getSlotSummary = (day: (typeof DAYS_OF_WEEK)[number]) => {
      const slot = masterTimetable.grid[day][p];
      if (!slot) return '-'.padEnd(9);
      if (slot.candidateSessions.length > 1) {
        return `[SPLIT ${slot.candidateSessions.length}]`.padEnd(9);
      }
      return slot.candidateSessions[0].courseCode.padEnd(9);
    };

    const mon = getSlotSummary('Monday');
    const tue = getSlotSummary('Tuesday');
    const wed = getSlotSummary('Wednesday');
    const thu = getSlotSummary('Thursday');
    const fri = getSlotSummary('Friday');

    console.log(`${pIdx} | ${win} | ${mon} | ${tue} | ${wed} | ${thu} | ${fri}`);
  }
  console.log('----------------------------------------------------------------------------------------\n');

  // 3. Resolve Personalized Schedule against Student Group Profile
  const groupProfile = PlumwareAttendanceParser.parseRegisteredCourses(coursesHtml);
  const personalizedSchedule = ScheduleResolver.resolvePersonalizedSchedule(
    masterTimetable,
    groupProfile,
    { rollNo: inference.rollNo }
  );

  console.log('03 // PERSONALIZED_WEEKLY_SCHEDULE        RESOLVED BATCH :: ' + personalizedSchedule.assignedGroup);
  console.log('----------------------------------------------------------------------------------------');
  console.log('DAY       | TIME          | CODE       | TYPE | BATCH | VENUE         | FACULTY');
  console.log('----------+---------------+------------+------+-------+---------------+-----------------');

  for (const day of DAYS_OF_WEEK) {
    const slots = personalizedSchedule.schedule[day];
    if (slots.length === 0) continue;

    for (const s of slots) {
      const dayStr = day.padEnd(9);
      const timeStr = `${s.startTime} - ${s.endTime}`.padEnd(13);
      const codeStr = s.courseCode.padEnd(10);
      const typeStr = s.component.slice(0, 4).toUpperCase().padEnd(4);
      const grpStr = s.group.padEnd(5);
      const roomStr = s.room.padEnd(13);
      const facStr = s.faculty;

      console.log(`${dayStr} | ${timeStr} | ${codeStr} | ${typeStr} | ${grpStr} | ${roomStr} | ${facStr}`);
    }
  }

  console.log('----------------------------------------------------------------------------------------');
  console.log(`TOTAL WEEKLY COMMITMENTS :: ${personalizedSchedule.totalWeeklyClasses} classes`);
  console.log(`LECTURE HOURS            :: ${personalizedSchedule.weeklyLectureHours} hrs`);
  console.log(`PRACTICAL / LAB HOURS    :: ${personalizedSchedule.weeklyPracticalHours} hrs (Zero Conflict)`);
  console.log(`TUTORIAL HOURS           :: ${personalizedSchedule.weeklyTutorialHours} hrs`);
  console.log('========================================================================================\n');
}

runTimetableDemo();
