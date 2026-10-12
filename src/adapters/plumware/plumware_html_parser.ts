import * as cheerio from 'cheerio';
import { PlumwareTripwireError } from '../../utils/errors.js';

export interface ExtractedLoginForm {
  encFy: string;
  fy: string;
  comp: string;
  t: string;
  hrandNum: string;
  captchaPath: string;
}

export type LoginClassificationResult =
  | { type: 'SUCCESS'; targetUrl?: string }
  | { type: 'INVALID_CAPTCHA'; reason: string }
  | { type: 'INVALID_CREDENTIALS'; reason: string }
  | { type: 'ACCESS_DENIED'; reason: string }
  | { type: 'UNKNOWN'; rawPreview: string };

/**
 * Resilient DOM parsing engine for legacy Plumware HTML responses.
 * Implements defensive queries, attribute lookups, and error pattern matchers.
 */
export class PlumwareHtmlParser {
  /**
   * Extracts essential authentication state tokens and CAPTCHA coordinates
   * from the Plumware login page markup.
   */
  static parseLoginForm(html: string): ExtractedLoginForm {
    const $ = cheerio.load(html);

    // 1. Extract hidden encrypted financial year token (enc_fy)
    const encFy =
      $('input[name="enc_fy"]').val()?.toString() ||
      $('#enc_fy').val()?.toString() ||
      '';

    // 2. Extract selected or default academic year (fy)
    let fy =
      $('select[name="fy"] option[selected]').val()?.toString() ||
      $('#fy option[selected]').val()?.toString() ||
      $('select[name="fy"] option').first().val()?.toString() ||
      '';

    if (!fy) {
      // Fallback: Infer financial year from current calendar year
      const now = new Date();
      const currentYear = now.getFullYear();
      const month = now.getMonth() + 1; // 1-12
      const startYear = month >= 7 ? currentYear : currentYear - 1;
      const endYearShort = String(startYear + 1).slice(-2);
      fy = `${startYear}-${endYearShort}`;
    }

    // 3. Extract company identifier (comp)
    const comp =
      $('input[name="comp"]').val()?.toString() ||
      $('#comp').val()?.toString() ||
      'NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY';

    // 4. Extract form routing token (t)
    const t =
      $('input[name="t"]').val()?.toString() ||
      $('#t').val()?.toString() ||
      'swx';

    // 5. Extract anti-replay random number (HRAND_NUM)
    const hrandNum =
      $('input[name="HRAND_NUM"]').val()?.toString() ||
      $('#HRAND_NUM').val()?.toString() ||
      String(Math.floor(Math.random() * 90000) + 10000);

    // 6. Extract CAPTCHA image element source (captchaimg)
    let captchaPath =
      $('#captchaimg').attr('src')?.trim() ||
      $('img[src*="captcha"]').attr('src')?.trim() ||
      '';

    // If not found in standard DOM nodes, inspect script references via regex
    if (!captchaPath) {
      const match = html.match(/(?:captchaimg['"]?\s*\.src\s*=\s*['"]|src=['"])(images\/captcha\/[^'"]+)/i);
      if (match && match[1]) {
        captchaPath = match[1];
      }
    }

    // Normalize captcha path: strip leading slashes if present
    if (captchaPath.startsWith('/')) {
      captchaPath = captchaPath.slice(1);
    }

    if (!captchaPath) {
      throw new PlumwareTripwireError(
        'Unable to locate CAPTCHA image reference in Plumware login payload.',
        { preview: html.slice(0, 500) }
      );
    }

    return {
      encFy,
      fy,
      comp,
      t,
      hrandNum,
      captchaPath,
    };
  }

  /**
   * Parses the JavaScript snippet returned by plum5_fw_utils.php?rty=captcha
   * Example snippet:
   * parent.frames['data'].document.getElementById('captchaimg').src='images/captcha/captcha_1791748832.jpg';
   */
  static parseCaptchaRefreshScript(scriptText: string): { captchaPath: string; originalCap?: string } {
    // Matches:
    // 1. parent.document.getElementById('captchaimg').src='images/captcha/captcha_123.jpg';
    // 2. parent.frames['data'].document.getElementById('captchaimg').src='images/captcha/captcha_123.jpg';
    // 3. Fallback to any images/captcha path string inside quotes
    const srcMatch =
      scriptText.match(/captchaimg[^=]*\.src\s*=\s*['"]([^'"]+)['"]/i) ||
      scriptText.match(/['"](images\/captcha\/[^'"]+)['"]/i);

    const capMatch = scriptText.match(/originalcap[^=]*\.value\s*=\s*['"]([^'"]+)['"]/i);

    if (!srcMatch || !srcMatch[1]) {
      throw new PlumwareTripwireError(
        'Failed to parse updated CAPTCHA coordinates from Plumware refresh script.',
        { scriptSnippet: scriptText.slice(0, 300) }
      );
    }

    let captchaPath = srcMatch[1].trim();
    if (captchaPath.startsWith('/')) {
      captchaPath = captchaPath.slice(1);
    }

    return {
      captchaPath,
      originalCap: capMatch ? capMatch[1] : undefined,
    };
  }

  /**
   * Classifies a login response into one of the canonical domain outcomes.
   */
  static classifyLoginResponse(
    html: string,
    _httpStatus: number,
    locationHeader?: string
  ): LoginClassificationResult {
    const lowerHtml = html.toLowerCase();
    const targetUrl = locationHeader || '';

    // 1. CAPTCHA Mismatch Checks
    if (
      lowerHtml.includes('invalid security number') ||
      lowerHtml.includes('invalid security code') ||
      lowerHtml.includes('please enter captcha')
    ) {
      return {
        type: 'INVALID_CAPTCHA',
        reason: 'Plumware rejected the provided security code (CAPTCHA mismatch).',
      };
    }

    // 2. Credential Mismatch Checks
    if (
      lowerHtml.includes('invalid login') ||
      lowerHtml.includes('invalid userid') ||
      lowerHtml.includes('please enter userid') ||
      lowerHtml.includes('please enter password')
    ) {
      return {
        type: 'INVALID_CREDENTIALS',
        reason: 'Plumware rejected the student credentials (Roll Number or Password).',
      };
    }

    // 3. Security Traps & Access Denied Checks
    if (
      lowerHtml.includes('access denied') ||
      lowerHtml.includes('invalid attempt') ||
      lowerHtml.includes('plum-security.gif')
    ) {
      return {
        type: 'ACCESS_DENIED',
        reason: 'Plumware security tripwire activated (Access Denied / Invalid Attempt).',
      };
    }

    // 4. Success Indicators:
    // If redirected to an authenticated dashboard frame or contains student menus
    const successUrlPatterns = ['student_index', 'student_home', 'plum_menu', 'middle_frame', 'student_view'];
    const hasSuccessRedirect = successUrlPatterns.some((pattern) => targetUrl.toLowerCase().includes(pattern));

    if (
      hasSuccessRedirect ||
      lowerHtml.includes('student_menu') ||
      lowerHtml.includes('welcome to student') ||
      lowerHtml.includes('logout.php') ||
      lowerHtml.includes('current sem courses registered')
    ) {
      return {
        type: 'SUCCESS',
        targetUrl,
      };
    }

    // If redirected back to plum5_fw_login.php?uid= without error text, it might still have an error message on the rendered page
    if (targetUrl.includes('plum5_fw_login.php?uid=')) {
      return {
        type: 'INVALID_CREDENTIALS',
        reason: 'Login failed with redirect back to login surface.',
      };
    }

    return {
      type: 'UNKNOWN',
      rawPreview: html.slice(0, 300),
    };
  }
}
