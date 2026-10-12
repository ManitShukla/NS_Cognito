import { describe, it, expect } from 'vitest';
import { TimetableInferenceService } from '../src/services/timetable_inference.service.js';

describe('TimetableInferenceService', () => {
  describe('inferFromRollNumber', () => {
    it('infers branch, program, and odd semester for 2024 B.Tech CSB student in October 2026', () => {
      // Reference date: October 12, 2026 (Monsoon / Odd Semester)
      const oct2026 = new Date(2026, 9, 12); // Month index 9 = October
      const inference = TimetableInferenceService.inferFromRollNumber('2024UCB1234', oct2026);

      expect(inference.rollNo).toBe('2024UCB1234');
      expect(inference.program).toBe('B.Tech');
      expect(inference.admissionYear).toBe(2024);
      expect(inference.branchCode).toBe('CSB');
      expect(inference.branchName).toBe('Computer Science & Business Systems');
      expect(inference.academicYear).toBe('2026-27');
      // Admitted 2024: delta = 2 years -> Semester = 2 * 2 + 1 = 5
      expect(inference.currentSemester).toBe(5);
      expect(inference.isEvenSemester).toBe(false);
      expect(inference.termLabel).toContain('Monsoon');
      expect(inference.defaultSection).toBe('1');
    });

    it('infers even semester for 2024 B.Tech CSB student in February 2026', () => {
      // Reference date: February 15, 2026 (Winter / Even Semester)
      const feb2026 = new Date(2026, 1, 15); // Month index 1 = February
      const inference = TimetableInferenceService.inferFromRollNumber('2024UCB1234', feb2026);

      expect(inference.admissionYear).toBe(2024);
      expect(inference.academicYear).toBe('2025-26');
      // Admitted 2024: delta = 2 years -> Semester = 2 * 2 = 4
      expect(inference.currentSemester).toBe(4);
      expect(inference.isEvenSemester).toBe(true);
      expect(inference.termLabel).toContain('Winter');
    });

    it('infers 1st semester for freshman admitted in current year', () => {
      const oct2026 = new Date(2026, 9, 12);
      const freshman = TimetableInferenceService.inferFromRollNumber('2026UCA1001', oct2026);

      expect(freshman.admissionYear).toBe(2026);
      expect(freshman.branchCode).toBe('CSAI');
      expect(freshman.branchName).toContain('AI');
      expect(freshman.currentSemester).toBe(1);
      expect(freshman.isEvenSemester).toBe(false);
    });

    it('infers 7th semester for senior student', () => {
      const oct2026 = new Date(2026, 9, 12);
      const senior = TimetableInferenceService.inferFromRollNumber('2023UIT1055', oct2026);

      expect(senior.admissionYear).toBe(2023);
      expect(senior.branchCode).toBe('IT');
      expect(senior.branchName).toBe('Information Technology');
      // Admitted 2023: delta = 3 years -> Semester = 2 * 3 + 1 = 7
      expect(senior.currentSemester).toBe(7);
    });

    it('clamps semester to maximum 8 for graduating seniors', () => {
      const oct2026 = new Date(2026, 9, 12);
      const superSenior = TimetableInferenceService.inferFromRollNumber('2020UEC1001', oct2026);

      expect(superSenior.currentSemester).toBe(8);
    });

    it('resolves postgraduate M.Tech program from level prefix P', () => {
      const oct2026 = new Date(2026, 9, 12);
      const pgStudent = TimetableInferenceService.inferFromRollNumber('2025PME1001', oct2026);

      expect(pgStudent.program).toBe('M.Tech');
      expect(pgStudent.branchCode).toBe('ME');
      expect(pgStudent.branchName).toContain('Mechanical');
      expect(pgStudent.currentSemester).toBe(3);
    });

    it('resolves specialized branch codes (MAC, ECE, CSDS, IoT)', () => {
      const oct2026 = new Date(2026, 9, 12);

      const mac = TimetableInferenceService.inferFromRollNumber('2024UMC1001', oct2026);
      expect(mac.branchCode).toBe('MAC');
      expect(mac.branchName).toBe('Mathematics & Computing');

      const ece = TimetableInferenceService.inferFromRollNumber('2024UEC1001', oct2026);
      expect(ece.branchCode).toBe('ECE');

      const iot = TimetableInferenceService.inferFromRollNumber('2024UCI1001', oct2026);
      expect(iot.branchCode).toBe('CSIOT');
    });

    it('handles malformed roll numbers gracefully with default values when not in strict mode', () => {
      const inference = TimetableInferenceService.inferFromRollNumber('INVALID_ROLL');

      expect(inference.program).toBe('B.Tech');
      expect(inference.branchCode).toBe('CSB');
      expect(inference.currentSemester).toBeGreaterThanOrEqual(1);
    });

    it('throws UNRECOGNIZED_ROLL_FORMAT in strict mode for malformed roll syntax', () => {
      expect(() => {
        TimetableInferenceService.inferFromRollNumber('INVALID_ROLL', new Date(), { strict: true });
      }).toThrowError(/Unrecognized student roll number format/);
    });

    it('throws UNRECOGNIZED_ROLL_FORMAT in strict mode for unknown department code', () => {
      expect(() => {
        TimetableInferenceService.inferFromRollNumber('2024UXYZ1001', new Date(), { strict: true });
      }).toThrowError(/Unrecognized NSUT department or branch code/);
    });
  });

  describe('Audit Vector 3: Temporal Rollover Heuristics & Semester Arithmetic', () => {
    it('evaluates October 2026 to Academic Year 2026-27 (Odd Term)', () => {
      const octDate = new Date(2026, 9, 15);
      const res = TimetableInferenceService.inferFromRollNumber('2024UCB1001', octDate);
      expect(res.academicYear).toBe('2026-27');
      expect(res.isEvenSemester).toBe(false);
      expect(res.termLabel).toContain('Monsoon');
    });

    it('evaluates May 2027 to Academic Year 2026-27 (Even Term)', () => {
      const mayDate = new Date(2027, 4, 15); // Month index 4 = May
      const res = TimetableInferenceService.inferFromRollNumber('2024UCB1001', mayDate);
      expect(res.academicYear).toBe('2026-27');
      expect(res.isEvenSemester).toBe(true);
      expect(res.termLabel).toContain('Winter');
    });

    it('rolls over July 2027 to Academic Year 2027-28 (Odd Term)', () => {
      const julDate = new Date(2027, 6, 1); // Month index 6 = July
      const res = TimetableInferenceService.inferFromRollNumber('2024UCB1001', julDate);
      expect(res.academicYear).toBe('2027-28');
      expect(res.isEvenSemester).toBe(false);
      expect(res.termLabel).toContain('Monsoon');
    });

    it('verifies boundary rollover at Dec 31 23:59:59 vs Jan 1 00:00:01', () => {
      const dec31 = new Date(2026, 11, 31, 23, 59, 59);
      const jan1 = new Date(2027, 0, 1, 0, 0, 1);

      const resDec = TimetableInferenceService.inferFromRollNumber('2024UCB1001', dec31);
      const resJan = TimetableInferenceService.inferFromRollNumber('2024UCB1001', jan1);

      // Both belong to 2026-27 academic session
      expect(resDec.academicYear).toBe('2026-27');
      expect(resDec.isEvenSemester).toBe(false); // December is Odd term

      expect(resJan.academicYear).toBe('2026-27');
      expect(resJan.isEvenSemester).toBe(true); // January is Even term
    });

    it('verifies boundary rollover at June 30 vs July 1', () => {
      const jun30 = new Date(2027, 5, 30, 23, 59, 59);
      const jul1 = new Date(2027, 6, 1, 0, 0, 1);

      const resJun = TimetableInferenceService.inferFromRollNumber('2024UCB1001', jun30);
      const resJul = TimetableInferenceService.inferFromRollNumber('2024UCB1001', jul1);

      expect(resJun.academicYear).toBe('2026-27');
      expect(resJun.isEvenSemester).toBe(true);

      expect(resJul.academicYear).toBe('2027-28');
      expect(resJul.isEvenSemester).toBe(false);
    });

    it('verifies semester arithmetic: Sem = 2 * (Current Academic Year - Admission Year) + Offset', () => {
      // Test Case 1: Adm 2026, Current Date Oct 2026 (Cur Acad Year 2026, Offset 1)
      // Sem = 2 * (2026 - 2026) + 1 = 1
      const oct2026 = new Date(2026, 9, 15);
      const sem1 = TimetableInferenceService.inferFromRollNumber('2026UCB1001', oct2026);
      expect(sem1.currentSemester).toBe(1);

      // Test Case 2: Adm 2025, Current Date March 2027 (Cur Acad Year 2026, Offset 2)
      // Sem = 2 * (2026 - 2025) + 2 = 4
      const mar2027 = new Date(2027, 2, 15);
      const sem4 = TimetableInferenceService.inferFromRollNumber('2025UCB1001', mar2027);
      expect(sem4.currentSemester).toBe(4);
    });
  });
});

