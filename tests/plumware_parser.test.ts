import { describe, it, expect } from 'vitest';
import { PlumwareHtmlParser } from '../src/adapters/plumware/plumware_html_parser.js';
import { PlumwareTripwireError } from '../src/utils/errors.js';

describe('PlumwareHtmlParser', () => {
  const sampleLoginFormHtml = `
    <html>
      <head><title>NSIT</title></head>
      <body>
        <form name="f1" action="plum5_fw_login.php" method="POST">
          <input type="text" name="uid" id="uid" value="">
          <input type="password" name="pwd" id="pwd" value="">
          <select name="fy" id="fy">
            <option value="">Select...</option>
            <option value="2026-27" selected>2026-27</option>
            <option value="2025-26">2025-26</option>
          </select>
          <input type="hidden" name="enc_fy" id="enc_fy" value="TEST_ENCRYPTED_TOKEN_XYZ">
          <input type="hidden" name="comp" id="comp" value="NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY">
          <input type="hidden" name="t" id="t" value="swx">
          <input type="hidden" name="HRAND_NUM" id="HRAND_NUM" value="98765">
          <img id="captchaimg" src="images/captcha/captcha_123456789.jpg">
          <input type="text" name="cap" id="cap">
        </form>
      </body>
    </html>
  `;

  describe('parseLoginForm', () => {
    it('correctly extracts all hidden tokens and CAPTCHA path', () => {
      const extracted = PlumwareHtmlParser.parseLoginForm(sampleLoginFormHtml);

      expect(extracted.encFy).toBe('TEST_ENCRYPTED_TOKEN_XYZ');
      expect(extracted.fy).toBe('2026-27');
      expect(extracted.comp).toBe('NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY');
      expect(extracted.t).toBe('swx');
      expect(extracted.hrandNum).toBe('98765');
      expect(extracted.captchaPath).toBe('images/captcha/captcha_123456789.jpg');
    });

    it('throws PlumwareTripwireError when CAPTCHA image is completely missing', () => {
      const corruptedHtml = `<html><body><form name="f1"></form></body></html>`;
      expect(() => PlumwareHtmlParser.parseLoginForm(corruptedHtml)).toThrow(PlumwareTripwireError);
    });

    it('infers financial year when select tag is missing', () => {
      const htmlWithoutFy = sampleLoginFormHtml.replace(/<select[\s\S]*?<\/select>/, '');
      const extracted = PlumwareHtmlParser.parseLoginForm(htmlWithoutFy);
      expect(extracted.fy).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('parseCaptchaRefreshScript', () => {
    it('parses parent.document.getElementById style refresh script', () => {
      const script = `<script>
        parent.document.getElementById('captchaimg').src='images/captcha/captcha_99999.jpg';
        parent.document.getElementById('cap').value='';
      </script>`;

      const result = PlumwareHtmlParser.parseCaptchaRefreshScript(script);
      expect(result.captchaPath).toBe('images/captcha/captcha_99999.jpg');
    });

    it('parses parent.frames["data"] style refresh script with originalcap', () => {
      const script = `<script>
        parent.frames['data'].document.getElementById('captchaimg').src='images/captcha/captcha_88888.jpg';
        parent.frames['data'].document.getElementById('originalcap').value='54321';
      </script>`;

      const result = PlumwareHtmlParser.parseCaptchaRefreshScript(script);
      expect(result.captchaPath).toBe('images/captcha/captcha_88888.jpg');
      expect(result.originalCap).toBe('54321');
    });

    it('throws PlumwareTripwireError on invalid script', () => {
      expect(() => PlumwareHtmlParser.parseCaptchaRefreshScript('alert("nothing here");')).toThrow(
        PlumwareTripwireError
      );
    });
  });

  describe('classifyLoginResponse', () => {
    it('classifies invalid security number as INVALID_CAPTCHA', () => {
      const html = `<font color=red size=2><br><br>Invalid Security Number..Please try again<br><br></font>`;
      const outcome = PlumwareHtmlParser.classifyLoginResponse(html, 200);
      expect(outcome.type).toBe('INVALID_CAPTCHA');
    });

    it('classifies invalid login credentials as INVALID_CREDENTIALS', () => {
      const html = `<font color=red size=2><br><br>Invalid Login..Please try again<br><br></font>`;
      const outcome = PlumwareHtmlParser.classifyLoginResponse(html, 200);
      expect(outcome.type).toBe('INVALID_CREDENTIALS');
    });

    it('classifies access denied / invalid attempt as ACCESS_DENIED', () => {
      const html = `<center><img src='images/plum-security.gif'><br>Invalid Attempt</center>`;
      const outcome = PlumwareHtmlParser.classifyLoginResponse(html, 200);
      expect(outcome.type).toBe('ACCESS_DENIED');
    });

    it('classifies authenticated student menu redirect as SUCCESS', () => {
      const html = `<html><frameset><frame src="student_menu.php"></frameset></html>`;
      const outcome = PlumwareHtmlParser.classifyLoginResponse(html, 200, 'student_index.htm');
      expect(outcome.type).toBe('SUCCESS');
    });
  });
});
