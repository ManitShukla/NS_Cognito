import type { ISessionStore } from '../adapters/cache/session_store.interface.js';
import { PlumwareHttpClient } from '../adapters/plumware/plumware_http_client.js';
import { PlumwareNavigator } from '../adapters/plumware/plumware_navigator.js';
import { PlumwareAttendanceParser } from '../adapters/plumware/plumware_attendance_parser.js';
import { BunkIntelligenceService } from './bunk_intelligence.service.js';
import type {
  StudentAcademicProfile,
  StudentGroupProfile,
  SubjectAttendance,
  OverallAttendanceSummary,
  AttendanceMatrixRecord,
} from '../types/academic.js';
import { SessionExpiredError, PlumwareTripwireError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface AttendanceEngineDependencies {
  sessionStore: ISessionStore;
  httpClient?: PlumwareHttpClient;
}

/**
 * High-performance orchestrator for student attendance telemetry,
 * dynamic sidebar route resolution, and sub-batch group extraction.
 */
export class AttendanceEngineService {
  private readonly sessionStore: ISessionStore;
  private readonly httpClient: PlumwareHttpClient;

  constructor(deps: AttendanceEngineDependencies) {
    this.sessionStore = deps.sessionStore;
    this.httpClient = deps.httpClient || new PlumwareHttpClient();
  }

  /**
   * Retrieves, parses, and normalizes the student's live attendance matrix and bunk metrics.
   */
  async getStudentAttendance(sessionToken: string): Promise<{
    subjects: SubjectAttendance[];
    overallSummary: OverallAttendanceSummary;
    records: AttendanceMatrixRecord[];
  }> {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError('Authenticated session has expired or is invalid.');
    }

    logger.info('ATTENDANCE', `Fetching live attendance for Roll: ${session.rollNo}`);

    try {
      // 1. Fetch the navigation menu frame to discover the active dynamic plum_url.php token
      const menuResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, 'student_index.htm');
      PlumwareNavigator.verifyResponseIntegrity(menuResp.html, menuResp.statusCode, menuResp.location);

      const navLinks = PlumwareNavigator.extractNavigationLinks(menuResp.html);

      // If navigation link was not found on student_index, check student_menu.php or blank.htm
      let attendanceUrl = navLinks.attendanceUrl;
      if (!attendanceUrl) {
        const fallbackMenu = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, 'student_menu.php');
        const fallbackLinks = PlumwareNavigator.extractNavigationLinks(fallbackMenu.html);
        attendanceUrl = fallbackLinks.attendanceUrl;
      }

      if (!attendanceUrl) {
        throw new PlumwareTripwireError(
          'Unable to locate dynamic "My Attendance" route in student dashboard frame.'
        );
      }

      // 2. Fetch the attendance matrix page using the dynamic token
      logger.debug('ATTENDANCE', `Requesting attendance matrix at: ${attendanceUrl.slice(0, 40)}...`);
      const attendanceResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, attendanceUrl);
      PlumwareNavigator.verifyResponseIntegrity(
        attendanceResp.html,
        attendanceResp.statusCode,
        attendanceResp.location
      );

      // 3. Parse table DOM and extract raw matrix data
      const parsed = PlumwareAttendanceParser.parseAttendanceMatrix(attendanceResp.html);

      // 4. Run through mathematical intelligence engine
      const { subjects, overallSummary } = BunkIntelligenceService.processMatrix(
        parsed.courseHeaders,
        parsed.records,
        parsed.portalSummaries,
        parsed.footnotes
      );

      logger.info(
        'ATTENDANCE',
        `Processed attendance for ${subjects.length} course(s). Overall percentage: ${overallSummary.overallPercentage}% (${overallSummary.status})`
      );

      return {
        subjects,
        overallSummary,
        records: parsed.records,
      };
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError || err instanceof PlumwareTripwireError) {
        logger.warn(
          'ATTENDANCE',
          `Session ${sessionToken.slice(0, 8)} purged due to upstream rejection: ${err instanceof Error ? err.message : String(err)}`
        );
        await this.sessionStore.delete(sessionToken);
      }
      throw err;
    }
  }

  /**
   * Retrieves and parses the student's sub-group assignments from "Current Sem Courses Registered".
   */
  async getStudentGroupProfile(sessionToken: string): Promise<StudentGroupProfile> {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError('Authenticated session has expired or is invalid.');
    }

    logger.info('GROUPS', `Extracting registered course groups for Roll: ${session.rollNo}`);

    try {
      // 1. Discover registered courses dynamic URL from dashboard
      const menuResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, 'student_index.htm');
      PlumwareNavigator.verifyResponseIntegrity(menuResp.html, menuResp.statusCode, menuResp.location);

      const navLinks = PlumwareNavigator.extractNavigationLinks(menuResp.html);

      let registeredCoursesUrl = navLinks.registeredCoursesUrl;
      if (!registeredCoursesUrl) {
        const fallbackMenu = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, 'student_menu.php');
        const fallbackLinks = PlumwareNavigator.extractNavigationLinks(fallbackMenu.html);
        registeredCoursesUrl = fallbackLinks.registeredCoursesUrl;
      }

      if (!registeredCoursesUrl) {
        throw new PlumwareTripwireError(
          'Unable to locate dynamic "Current Sem Courses Registered" route in student dashboard.'
        );
      }

      // 2. Fetch the registration roster HTML
      const coursesResp = await this.httpClient.fetchAuthenticatedPath(session.cookieJar, registeredCoursesUrl);
      PlumwareNavigator.verifyResponseIntegrity(
        coursesResp.html,
        coursesResp.statusCode,
        coursesResp.location
      );

      // 3. Parse into structured group profile
      const groupProfile = PlumwareAttendanceParser.parseRegisteredCourses(coursesResp.html);

      logger.info(
        'GROUPS',
        `Identified default group "${groupProfile.defaultGroup}" across ${groupProfile.registeredCourses.length} enrolled component(s)`
      );

      return groupProfile;
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError || err instanceof PlumwareTripwireError) {
        logger.warn(
          'GROUPS',
          `Session ${sessionToken.slice(0, 8)} purged due to upstream rejection: ${err instanceof Error ? err.message : String(err)}`
        );
        await this.sessionStore.delete(sessionToken);
      }
      throw err;
    }
  }

  /**
   * Atomic Aggregator: Fetches attendance metrics and course group mappings in parallel,
   * synthesizing a complete student academic profile.
   */
  async getStudentAcademicProfile(sessionToken: string): Promise<StudentAcademicProfile> {
    const session = await this.sessionStore.get(sessionToken);
    if (!session || !session.isAuthenticated) {
      throw new SessionExpiredError('Authenticated session has expired or is invalid.');
    }

    // Execute attendance parsing and course group extraction in parallel
    const [attendanceData, groupProfile] = await Promise.all([
      this.getStudentAttendance(sessionToken),
      this.getStudentGroupProfile(sessionToken),
    ]);

    return {
      rollNo: session.rollNo || 'UNKNOWN',
      academicYear: session.fy,
      overallSummary: attendanceData.overallSummary,
      subjects: attendanceData.subjects,
      groupProfile,
      attendanceRecords: attendanceData.records,
      lastUpdated: Date.now(),
    };
  }
}
