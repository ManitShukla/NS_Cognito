import { describe, it, expect } from 'vitest';
import { PlumwareNavigator } from '../src/adapters/plumware/plumware_navigator.js';
import { PlumwareTripwireError, SessionExpiredError } from '../src/utils/errors.js';

describe('PlumwareNavigator', () => {
  describe('extractNavigationLinks', () => {
    it('extracts dynamic encrypted plum_url.php links from dashboard menu anchors', () => {
      const sampleMenuHtml = `
        <html><body>
          <div class="menu">
            <a href="plum_url.php?EncryptedAttendanceHash12345" target="data">My Attendance</a>
            <a href="plum_url.php?EncryptedRegisteredCoursesHash67890" target="data">Current Sem Courses Registered</a>
            <a href="plum_url.php?EncryptedTimeTableHash55555" target="data">Time Table</a>
            <a href="logout.php">Logout</a>
          </div>
        </body></html>
      `;

      const links = PlumwareNavigator.extractNavigationLinks(sampleMenuHtml);

      expect(links.attendanceUrl).toBe('plum_url.php?EncryptedAttendanceHash12345');
      expect(links.registeredCoursesUrl).toBe('plum_url.php?EncryptedRegisteredCoursesHash67890');
      expect(links.timetableUrl).toBe('plum_url.php?EncryptedTimeTableHash55555');
    });

    it('extracts links specified via javascript openURL onclick handlers', () => {
      const onclickMenuHtml = `
        <a href="#" onclick="openURL('plum_url.php?DynamicAttendanceToken999')">Student Attendance</a>
        <a href="#" onclick="openURL('plum_url.php?DynamicCoursesToken888')">Courses Registered</a>
      `;

      const links = PlumwareNavigator.extractNavigationLinks(onclickMenuHtml);

      expect(links.attendanceUrl).toBe('plum_url.php?DynamicAttendanceToken999');
      expect(links.registeredCoursesUrl).toBe('plum_url.php?DynamicCoursesToken888');
    });
  });

  describe('verifyResponseIntegrity', () => {
    it('throws SessionExpiredError when session has terminated or redirects to login', () => {
      expect(() =>
        PlumwareNavigator.verifyResponseIntegrity('Please login again to continue', 200)
      ).toThrow(SessionExpiredError);

      expect(() =>
        PlumwareNavigator.verifyResponseIntegrity('<html></html>', 302, 'student_login.php')
      ).toThrow(SessionExpiredError);
    });

    it('throws PlumwareTripwireError when Access Denied alert is encountered', () => {
      const accessDeniedHtml = `
        <script>alert('Access Denied!');</script>
        <h3>Access Denied!</h3>
      `;

      expect(() => PlumwareNavigator.verifyResponseIntegrity(accessDeniedHtml, 200)).toThrow(
        PlumwareTripwireError
      );
    });

    it('throws PlumwareTripwireError when HTTP gateway error status is received', () => {
      expect(() => PlumwareNavigator.verifyResponseIntegrity('', 502)).toThrow(
        PlumwareTripwireError
      );
    });

    it('passes cleanly on valid HTML response', () => {
      expect(() =>
        PlumwareNavigator.verifyResponseIntegrity('<html><body>Attendance Table</body></html>', 200)
      ).not.toThrow();
    });
  });
});
