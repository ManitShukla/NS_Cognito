import { describe, it, expect } from 'vitest';
import { BunkIntelligenceService } from '../src/services/bunk_intelligence.service.js';

describe('BunkIntelligenceService', () => {
  describe('computePercentage', () => {
    it('calculates standard percentage rounded to two decimal places', () => {
      expect(BunkIntelligenceService.computePercentage(17, 20)).toBe(85.0);
      expect(BunkIntelligenceService.computePercentage(11, 13)).toBe(84.62);
      expect(BunkIntelligenceService.computePercentage(0, 10)).toBe(0.0);
    });

    it('returns 100.0% when zero classes have been conducted yet', () => {
      expect(BunkIntelligenceService.computePercentage(0, 0)).toBe(100.0);
    });
  });

  describe('computeBunkMargin', () => {
    it('correctly calculates safe bunks when attendance is well above 75%', () => {
      // 16 present out of 20 held (80%):
      // (16 - 0.75 * 20) / 0.75 = 1 / 0.75 = 1.333 -> floor is 1
      // If student skips 1 class: 16/21 = 76.19% >= 75%
      // If student skips 2 classes: 16/22 = 72.72% < 75%
      expect(BunkIntelligenceService.computeBunkMargin(16, 20)).toBe(1);

      // 20 present out of 20 held (100%):
      // (20 - 15) / 0.75 = 5 / 0.75 = 6.666 -> floor is 6
      // If student skips 6 classes: 20/26 = 76.92% >= 75%
      // If student skips 7 classes: 20/27 = 74.07% < 75%
      expect(BunkIntelligenceService.computeBunkMargin(20, 20)).toBe(6);
    });

    it('returns 0 bunks when attendance is exactly 75%', () => {
      // 15 present out of 20 held (75%)
      expect(BunkIntelligenceService.computeBunkMargin(15, 20)).toBe(0);
    });

    it('returns 0 bunks when attendance is below 75%', () => {
      // 14 present out of 20 held (70%)
      expect(BunkIntelligenceService.computeBunkMargin(14, 20)).toBe(0);
      expect(BunkIntelligenceService.computeBunkMargin(3, 10)).toBe(0);
    });

    it('returns 0 when held is 0', () => {
      expect(BunkIntelligenceService.computeBunkMargin(0, 0)).toBe(0);
    });
  });

  describe('computeClassesNeeded', () => {
    it('returns 0 when attendance is already at or above 75%', () => {
      expect(BunkIntelligenceService.computeClassesNeeded(15, 20)).toBe(0); // 75%
      expect(BunkIntelligenceService.computeClassesNeeded(18, 20)).toBe(0); // 90%
    });

    it('calculates exact consecutive classes required to reach 75%', () => {
      // 14 present out of 20 held (70%):
      // (0.75 * 20 - 14) / 0.25 = (15 - 14) / 0.25 = 1 / 0.25 = 4
      // Attending 4 consecutive classes: 18 / 24 = 75.0%
      expect(BunkIntelligenceService.computeClassesNeeded(14, 20)).toBe(4);

      // 13 present out of 20 held (65%):
      // (15 - 13) / 0.25 = 2 / 0.25 = 8
      // Attending 8 consecutive classes: 21 / 28 = 75.0%
      expect(BunkIntelligenceService.computeClassesNeeded(13, 20)).toBe(8);

      // 3 present out of 10 held (30%):
      // (7.5 - 3) / 0.25 = 4.5 / 0.25 = 18
      // Attending 18 consecutive classes: 21 / 28 = 75.0%
      expect(BunkIntelligenceService.computeClassesNeeded(3, 10)).toBe(18);
    });

    it('returns 0 when held is 0', () => {
      expect(BunkIntelligenceService.computeClassesNeeded(0, 0)).toBe(0);
    });
  });

  describe('classifyStatus', () => {
    it('classifies >= 80% as SAFE', () => {
      expect(BunkIntelligenceService.classifyStatus(80.0)).toBe('SAFE');
      expect(BunkIntelligenceService.classifyStatus(95.5)).toBe('SAFE');
    });

    it('classifies 75% to 79.99% as WARNING', () => {
      expect(BunkIntelligenceService.classifyStatus(75.0)).toBe('WARNING');
      expect(BunkIntelligenceService.classifyStatus(79.99)).toBe('WARNING');
    });

    it('classifies < 75% as CRITICAL', () => {
      expect(BunkIntelligenceService.classifyStatus(74.99)).toBe('CRITICAL');
      expect(BunkIntelligenceService.classifyStatus(50.0)).toBe('CRITICAL');
      expect(BunkIntelligenceService.classifyStatus(0.0)).toBe('CRITICAL');
    });
  });

  describe('auditIntegrity', () => {
    it('confirms integrity when calculated sums match portal summaries', () => {
      const audit = BunkIntelligenceService.auditIntegrity(
        { totalHeld: 20, totalPresent: 16, totalAbsent: 4 },
        { totalHeld: 20, totalPresent: 16, totalAbsent: 4 }
      );

      expect(audit.hasDiscrepancy).toBe(false);
      expect(audit.delta.heldDelta).toBe(0);
      expect(audit.warningMessage).toBeUndefined();
    });

    it('flags discrepancy and delta when portal numbers disagree without crashing', () => {
      const audit = BunkIntelligenceService.auditIntegrity(
        { totalHeld: 20, totalPresent: 15, totalAbsent: 5 },
        { totalHeld: 21, totalPresent: 16, totalAbsent: 5 }
      );

      expect(audit.hasDiscrepancy).toBe(true);
      expect(audit.delta.heldDelta).toBe(-1);
      expect(audit.delta.presentDelta).toBe(-1);
      expect(audit.warningMessage).toContain('Portal summary mismatch');
    });
  });

  describe('calculateOverallSummary', () => {
    it('aggregates multiple subjects correctly', () => {
      const subjects = [
        BunkIntelligenceService.processSubject({
          courseCode: 'CS101',
          totalHeld: 10,
          totalPresent: 8,
          totalAbsent: 2,
        }),
        BunkIntelligenceService.processSubject({
          courseCode: 'CS102',
          totalHeld: 10,
          totalPresent: 6,
          totalAbsent: 4,
        }),
      ];

      const overall = BunkIntelligenceService.calculateOverallSummary(subjects);

      expect(overall.totalHeld).toBe(20);
      expect(overall.totalPresent).toBe(14);
      expect(overall.totalAbsent).toBe(6);
      expect(overall.overallPercentage).toBe(70.0);
      expect(overall.status).toBe('CRITICAL');
      expect(overall.overallClassesNeededFor75).toBe(4);
    });
  });

  describe('Boundary, Zero-Division & Exact Integer Precision Proofs', () => {
    it('handles total held = 0 boundary gracefully (division by zero guard)', () => {
      const subject = BunkIntelligenceService.processSubject({
        courseCode: 'NEW101',
        totalHeld: 0,
        totalPresent: 0,
        totalAbsent: 0,
      });

      expect(subject.percentage).toBe(100.0);
      expect(subject.bunkMargin).toBe(0);
      expect(subject.classesNeededFor75).toBe(0);
      expect(subject.status).toBe('SAFE');
    });

    it('handles zero attendance held > 0', () => {
      const subject = BunkIntelligenceService.processSubject({
        courseCode: 'CS000',
        totalHeld: 10,
        totalPresent: 0,
        totalAbsent: 10,
      });

      expect(subject.percentage).toBe(0.0);
      expect(subject.bunkMargin).toBe(0);
      expect(subject.classesNeededFor75).toBe(30); // 3 * 10 - 4 * 0 = 30 (30 / 40 = 75.0%)
      expect(subject.status).toBe('CRITICAL');
    });

    it('handles perfect 100% attendance', () => {
      // 10 held, 10 present: (40 - 30) / 3 = 10 / 3 = 3 bunks
      // If 3 skipped: 10 / 13 = 76.92% >= 75%
      // If 4 skipped: 10 / 14 = 71.43% < 75%
      const subject = BunkIntelligenceService.processSubject({
        courseCode: 'CS100',
        totalHeld: 10,
        totalPresent: 10,
        totalAbsent: 0,
      });

      expect(subject.percentage).toBe(100.0);
      expect(subject.bunkMargin).toBe(3);
      expect(subject.classesNeededFor75).toBe(0);
      expect(subject.status).toBe('SAFE');
    });

    it('handles exact 75.00% cutoff boundary', () => {
      const subject20 = BunkIntelligenceService.processSubject({
        courseCode: 'CS075',
        totalHeld: 20,
        totalPresent: 15,
        totalAbsent: 5,
      });

      expect(subject20.percentage).toBe(75.0);
      expect(subject20.bunkMargin).toBe(0);
      expect(subject20.classesNeededFor75).toBe(0);
      expect(subject20.status).toBe('WARNING');

      const subject100 = BunkIntelligenceService.processSubject({
        courseCode: 'CS075B',
        totalHeld: 100,
        totalPresent: 75,
        totalAbsent: 25,
      });

      expect(subject100.percentage).toBe(75.0);
      expect(subject100.bunkMargin).toBe(0);
      expect(subject100.classesNeededFor75).toBe(0);
      expect(subject100.status).toBe('WARNING');
    });

    it('ensures single class deficit and surplus integer precision', () => {
      // 74 out of 100 (74.00% - just below cutoff)
      // 3(100) - 4(74) = 300 - 296 = 4 classes needed
      // (74 + 4) / (100 + 4) = 78 / 104 = 75.00%
      const subjectDeficit = BunkIntelligenceService.processSubject({
        courseCode: 'CS074',
        totalHeld: 100,
        totalPresent: 74,
        totalAbsent: 26,
      });

      expect(subjectDeficit.percentage).toBe(74.0);
      expect(subjectDeficit.bunkMargin).toBe(0);
      expect(subjectDeficit.classesNeededFor75).toBe(4);
      expect(subjectDeficit.status).toBe('CRITICAL');

      // 76 out of 100 (76.00% - just above cutoff)
      // 4(76) - 3(100) = 304 - 300 = 4 / 3 = 1 safe bunk
      // (76) / (100 + 1) = 76 / 101 = 75.247% >= 75%
      const subjectSurplus = BunkIntelligenceService.processSubject({
        courseCode: 'CS076',
        totalHeld: 100,
        totalPresent: 76,
        totalAbsent: 24,
      });

      expect(subjectSurplus.percentage).toBe(76.0);
      expect(subjectSurplus.bunkMargin).toBe(1);
      expect(subjectSurplus.classesNeededFor75).toBe(0);
      expect(subjectSurplus.status).toBe('WARNING');
    });
  });
});
