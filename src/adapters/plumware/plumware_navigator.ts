import * as cheerio from 'cheerio';
import { PlumwareTripwireError, PortalDesyncError, SessionExpiredError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface ExtractedNavigationLinks {
  attendanceUrl?: string;
  registeredCoursesUrl?: string;
  timetableUrl?: string;
  rawLinks: Record<string, string>;
}

export type NavigationTarget = 'MY_ATTENDANCE' | 'COURSES_REGISTERED' | 'TIMETABLE';

/**
 * Dynamic navigation engine for Plumware ERP.
 * Resolves transient, encrypted `plum_url.php?<token>` routes from sidebar frames,
 * enforces strict Referer chaining, and guards against frameset tripwires.
 */
export class PlumwareNavigator {
  /**
   * Scans an HTML frame (menu, sidebar, or dashboard) to extract encrypted dynamic URLs.
   */
  public static extractNavigationLinks(html: string): ExtractedNavigationLinks {
    const $ = cheerio.load(html);
    const rawLinks: Record<string, string> = {};

    let attendanceUrl: string | undefined;
    let registeredCoursesUrl: string | undefined;
    let timetableUrl: string | undefined;

    // Scan all anchor tags
    $('a').each((_, element) => {
      const el = $(element);
      const rawText = el.text().replace(/\s+/g, ' ').trim();
      let href = el.attr('href')?.trim();

      if (!href || href === '#' || href.startsWith('javascript:')) {
        // Check for onclick navigation: openURL('plum_url.php?...')
        const onClick = el.attr('onclick') || '';
        const match = onClick.match(/['"](plum_url\.php\?[^'"]+)['"]/i);
        if (match && match[1]) {
          href = match[1];
        }
      }

      if (href && !href.startsWith('javascript:void') && href !== '#') {
        const cleanHref = href.startsWith('/') ? href.slice(1) : href;
        rawLinks[rawText] = cleanHref;

        const lowerText = rawText.toLowerCase();

        // 1. Match Attendance
        if (
          lowerText.includes('attendance') &&
          !lowerText.includes('rule') &&
          !lowerText.includes('policy')
        ) {
          attendanceUrl = cleanHref;
        }

        // 2. Match Registered Courses / Sub-groups
        if (
          lowerText.includes('registered') ||
          lowerText.includes('registration') ||
          (lowerText.includes('course') && (lowerText.includes('reg') || lowerText.includes('list')))
        ) {
          registeredCoursesUrl = cleanHref;
        }

        // 3. Match Timetable
        if (
          lowerText.includes('time table') ||
          lowerText.includes('timetable') ||
          lowerText.includes('class schedule')
        ) {
          timetableUrl = cleanHref;
        }
      }
    });

    // Fallback: If not found in anchors, inspect script blocks for plum_url.php assignments
    if (!attendanceUrl || !registeredCoursesUrl) {
      const scriptMatches = html.matchAll(/(['"][^'"]*attendance[^'"]*['"][\s\S]*?['"](plum_url\.php\?[^'"]+)['"])/gi);
      for (const match of scriptMatches) {
        if (!attendanceUrl && match[2]) {
          attendanceUrl = match[2];
        }
      }
    }

    logger.debug('NAV', 'Extracted navigation routes', {
      attendanceUrl: attendanceUrl ? `${attendanceUrl.slice(0, 30)}...` : undefined,
      registeredCoursesUrl: registeredCoursesUrl ? `${registeredCoursesUrl.slice(0, 30)}...` : undefined,
      totalLinks: Object.keys(rawLinks).length,
    });

    return {
      attendanceUrl,
      registeredCoursesUrl,
      timetableUrl,
      rawLinks,
    };
  }

  /**
   * Evaluates response DOM and status code for security tripwires or session invalidation.
   */
  public static verifyResponseIntegrity(
    html: string,
    httpStatus: number,
    locationHeader?: string
  ): void {
    const lower = html.toLowerCase();
    const location = (locationHeader || '').toLowerCase();

    // 1. Session Expiration Traps
    if (
      lower.includes('session expired') ||
      lower.includes('please login again') ||
      location.includes('student_login') ||
      location.includes('student.htm')
    ) {
      throw new SessionExpiredError(
        'Upstream Plumware session expired or was terminated during navigation.'
      );
    }

    // 2. Access Denied / Frame Desynchronization Traps
    if (
      lower.includes('access denied!') ||
      lower.includes('access denied') ||
      lower.includes('invalid attempt') ||
      lower.includes('plum-security.gif') ||
      lower.includes("alert('access denied") ||
      lower.includes('alert("access denied')
    ) {
      throw new PortalDesyncError(
        'Plumware rejected the dynamic navigation token. Frame state or Referer desynchronization detected.',
        { preview: html.slice(0, 300), location }
      );
    }

    // 3. HTTP status error checks
    if (httpStatus >= 400) {
      throw new PlumwareTripwireError(
        `Upstream gateway returned HTTP ${httpStatus} during frame navigation.`,
        { httpStatus }
      );
    }
  }
}
