import fs from 'fs';
import path from 'path';
import { PlumwareAttendanceParser } from '../src/adapters/plumware/plumware_attendance_parser.js';
import { BunkIntelligenceService } from '../src/services/bunk_intelligence.service.js';

/**
 * NS COGNITO // CLI ACADEMIC TELEMETRY & BUNK CALCULATOR HARNESS
 * Demonstrates matrix normalization, bunk calculations, and sub-batch resolution
 * formatted according to the Swiss Editorial Telemetry contract.
 */
function runTelemetryDemo() {
  console.log('========================================================================================');
  console.log('                 NS COGNITO // ACADEMIC TELEMETRY & ATTENDANCE INTELLIGENCE             ');
  console.log('              SWISS EDITORIAL LAYOUT × HIGH-DENSITY HIGH-PRECISION METRICS              ');
  console.log('========================================================================================\n');

  const fixtureDir = path.resolve(process.cwd(), 'tests', 'fixtures');
  const normalHtml = fs.readFileSync(path.join(fixtureDir, 'attendance_normal.html'), 'utf-8');
  const coursesHtml = fs.readFileSync(path.join(fixtureDir, 'courses_registered.html'), 'utf-8');

  // 1. Ingest Course Registration & Sub-Batch Allocation
  const groupProfile = PlumwareAttendanceParser.parseRegisteredCourses(coursesHtml);

  console.log('01 // SUB_BATCH_REGISTRY                  RESOLVED_DEFAULT :: ' + groupProfile.defaultGroup);
  console.log('----------------------------------------------------------------------------------------');
  console.log('CODE       | COMPONENT  | ASSIGNED BATCH | TITLE');
  console.log('-----------+------------+----------------+----------------------------------------------');
  for (const c of groupProfile.registeredCourses) {
    const code = c.courseCode.padEnd(10);
    const type = c.componentType.padEnd(10);
    const grp = c.group.padEnd(14);
    console.log(`${code} | ${type} | ${grp} | ${c.courseTitle}`);
  }
  console.log('----------------------------------------------------------------------------------------\n');

  // 2. Ingest Attendance Matrix Table
  const matrixData = PlumwareAttendanceParser.parseAttendanceMatrix(normalHtml);
  const { subjects, overallSummary } = BunkIntelligenceService.processMatrix(
    matrixData.courseHeaders,
    matrixData.records,
    matrixData.portalSummaries,
    matrixData.footnotes
  );

  console.log('02 // ATTENDANCE_TELEMETRY_GRID            THRESHOLD :: 75.00% CUTOFF');
  console.log('----------------------------------------------------------------------------------------');
  console.log('CODE       | CONDUCTED | ATTENDED | MISSED | PERC (%) | BUNK BUFFER | NEEDED | STATUS');
  console.log('-----------+-----------+----------+--------+----------+-------------+--------+----------');

  for (const s of subjects) {
    const code = s.courseCode.padEnd(10);
    const cond = String(s.totalClasses).padStart(9);
    const att = String(s.present).padStart(8);
    const abs = String(s.absent).padStart(6);
    const pct = `${s.percentage.toFixed(2)}%`.padStart(8);
    const bunk = `${s.bunkMargin} class(es)`.padStart(11);
    const need = `${s.classesNeededFor75} class(es)`.padStart(6);
    const status = s.status === 'SAFE' ? '■ SAFE' : s.status === 'WARNING' ? '▲ WARN' : '✖ CRIT';

    console.log(`${code} | ${cond} | ${att} | ${abs} | ${pct} | ${bunk} | ${need} | ${status}`);
  }
  console.log('----------------------------------------------------------------------------------------');

  console.log('\n03 // OVERALL_ACADEMIC_SUMMARY');
  console.log('----------------------------------------------------------------------------------------');
  console.log(`TOTAL CLASSES CONDUCTED   :: ${overallSummary.totalHeld}`);
  console.log(`TOTAL CLASSES ATTENDED    :: ${overallSummary.totalPresent}`);
  console.log(`TOTAL CLASSES MISSED      :: ${overallSummary.totalAbsent}`);
  console.log(`OVERALL PERCENTAGE        :: ${overallSummary.overallPercentage.toFixed(2)}%`);
  console.log(`AGGREGATE BUNK MARGIN     :: ${overallSummary.overallBunkMargin} class(es)`);
  console.log(`CLASSES NEEDED FOR 75%    :: ${overallSummary.overallClassesNeededFor75} class(es)`);
  console.log(`OVERALL ACADEMIC STATUS   :: ${overallSummary.status}`);
  console.log('========================================================================================\n');
}

runTelemetryDemo();
