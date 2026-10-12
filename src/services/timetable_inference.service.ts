import type { StudentAcademicInference } from '../types/timetable.js';
import { UnrecognizedRollError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface BranchMetadata {
  code: string;
  name: string;
  degree: string;
  sections: number;
}

export interface InferRollOptions {
  strict?: boolean;
}

/**
 * High-performance inference coprocessor for NSUT student roll numbers
 * and academic temporal projections. Eliminates manual dropdown selection friction.
 */
export class TimetableInferenceService {
  /**
   * Official NSUT Department and Branch Registry.
   */
  private static readonly BRANCH_REGISTRY: Record<string, BranchMetadata> = {
    // Computer Science & Specializations
    CB: { code: 'CSB', name: 'Computer Science & Business Systems', degree: 'B.Tech', sections: 1 },
    CSB: { code: 'CSB', name: 'Computer Science & Business Systems', degree: 'B.Tech', sections: 1 },
    CS: { code: 'CSE', name: 'Computer Science & Engineering', degree: 'B.Tech', sections: 3 },
    CSE: { code: 'CSE', name: 'Computer Science & Engineering', degree: 'B.Tech', sections: 3 },
    COE: { code: 'COE', name: 'Computer Engineering', degree: 'B.Tech', sections: 3 },
    CA: { code: 'CSAI', name: 'Computer Science & Engineering (AI)', degree: 'B.Tech', sections: 2 },
    CSAI: { code: 'CSAI', name: 'Computer Science & Engineering (AI)', degree: 'B.Tech', sections: 2 },
    CI: { code: 'CSIOT', name: 'Computer Science & Engineering (IoT)', degree: 'B.Tech', sections: 1 },
    CSIOT: { code: 'CSIOT', name: 'Computer Science & Engineering (IoT)', degree: 'B.Tech', sections: 1 },
    DS: { code: 'CSDS', name: 'Computer Science & Engineering (Data Science)', degree: 'B.Tech', sections: 1 },
    CSDS: { code: 'CSDS', name: 'Computer Science & Engineering (Data Science)', degree: 'B.Tech', sections: 1 },

    // Information Technology
    IT: { code: 'IT', name: 'Information Technology', degree: 'B.Tech', sections: 2 },
    ITNS: { code: 'ITNS', name: 'Information Technology (Network & Security)', degree: 'B.Tech', sections: 1 },

    // Electronics & Communication
    EC: { code: 'ECE', name: 'Electronics & Communication Engineering', degree: 'B.Tech', sections: 3 },
    ECE: { code: 'ECE', name: 'Electronics & Communication Engineering', degree: 'B.Tech', sections: 3 },
    EI: { code: 'ECAM', name: 'Electronics & Communication (AI & ML)', degree: 'B.Tech', sections: 1 },
    ECAM: { code: 'ECAM', name: 'Electronics & Communication (AI & ML)', degree: 'B.Tech', sections: 1 },

    // Electrical & Instrumentation
    EE: { code: 'EE', name: 'Electrical Engineering', degree: 'B.Tech', sections: 2 },
    IC: { code: 'ICE', name: 'Instrumentation & Control Engineering', degree: 'B.Tech', sections: 2 },
    ICE: { code: 'ICE', name: 'Instrumentation & Control Engineering', degree: 'B.Tech', sections: 2 },

    // Mechanical & Allied
    ME: { code: 'ME', name: 'Mechanical Engineering', degree: 'B.Tech', sections: 2 },
    MEEV: { code: 'MEEV', name: 'Mechanical Engineering (EV)', degree: 'B.Tech', sections: 1 },
    MP: { code: 'MPAE', name: 'Manufacturing Processes & Automation Engineering', degree: 'B.Tech', sections: 1 },
    MPAE: { code: 'MPAE', name: 'Manufacturing Processes & Automation Engineering', degree: 'B.Tech', sections: 1 },

    // Mathematics, Civil, Chemical, Biotech
    MC: { code: 'MAC', name: 'Mathematics & Computing', degree: 'B.Tech', sections: 2 },
    MAC: { code: 'MAC', name: 'Mathematics & Computing', degree: 'B.Tech', sections: 2 },
    BT: { code: 'BT', name: 'Biotechnology', degree: 'B.Tech', sections: 1 },
    CE: { code: 'CE', name: 'Civil Engineering', degree: 'B.Tech', sections: 1 },
    CH: { code: 'CH', name: 'Chemical Engineering', degree: 'B.Tech', sections: 1 },
    GI: { code: 'GI', name: 'Geoinformatics', degree: 'B.Tech', sections: 1 },
    DM: { code: 'DES', name: 'Design', degree: 'B.Des', sections: 1 },
  };

  /**
   * Infers all academic parameters from a student's roll number and system date.
   *
   * NSUT Roll Syntax:
   *   `YYYY` (Admission Year, e.g. 2024)
   *   `U` | `P` | `D` (Level: Undergraduate / Postgraduate / Doctorate)
   *   `[A-Z]{2,4}` (Branch Code: CB, IT, EC, CS, etc.)
   *   `\d{3,5}` (Student Rank / Roll index)
   */
  public static inferFromRollNumber(
    rawRollNo: string,
    referenceDate = new Date(),
    options?: InferRollOptions
  ): StudentAcademicInference {
    const clean = rawRollNo.trim().toUpperCase().replace(/[\s\-_]/g, '');

    // Regex matching standard NSUT Roll numbers
    const rollRegex = /^(\d{4})([UPD])([A-Z]{2,4})(\d{1,5})$/;
    const match = clean.match(rollRegex);

    if (options?.strict && !match) {
      throw new UnrecognizedRollError(
        `Unrecognized student roll number format: "${rawRollNo}". Expected NSUT pattern: <YYYY><Level><Branch><Roll>.`,
        { rollNo: rawRollNo }
      );
    }

    const admissionYear = match ? parseInt(match[1], 10) : referenceDate.getFullYear();
    const levelCode = match ? match[2] : 'U';
    const rawBranchCode = match ? match[3] : 'CSB';

    if (options?.strict && !this.BRANCH_REGISTRY[rawBranchCode]) {
      throw new UnrecognizedRollError(
        `Unrecognized NSUT department or branch code: "${rawBranchCode}" in roll number "${rawRollNo}".`,
        { branchCode: rawBranchCode, rollNo: rawRollNo }
      );
    }

    // Program resolution
    let program = 'B.Tech';
    if (levelCode === 'P') program = 'M.Tech';
    if (levelCode === 'D') program = 'Ph.D';

    // Branch resolution
    const branchMeta = this.BRANCH_REGISTRY[rawBranchCode] || {
      code: rawBranchCode,
      name: `${rawBranchCode} Engineering`,
      degree: program,
      sections: 1,
    };

    // Calculate Semester & Academic Year based on localized Indian Standard Time (IST) coordinates
    // Prevents calendar boundary drift (Dec 31 -> Jan 1, June 30 -> July 1) in containerized UTC environments
    const istDateStr = referenceDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(istDateStr);
    const refYear = istDate.getFullYear();
    const refMonth = istDate.getMonth(); // 0 = Jan, 6 = July, 9 = Oct

    // Academic Semester Calendar:
    // July to December (Months 6..11) = Odd Semester (Monsoon)
    // January to June (Months 0..5)    = Even Semester (Winter)
    const isOddTerm = refMonth >= 6; // July through December
    const isEvenSemester = !isOddTerm;

    const yearDelta = Math.max(0, refYear - admissionYear);

    let calculatedSemester: number;
    let academicYearStr: string;
    let termLabel: string;

    if (isOddTerm) {
      // e.g. Admitted 2024, in Oct 2026: yearDelta = 2 -> Semester = 2 * 2 + 1 = 5
      // e.g. Admitted 2026, in Oct 2026: yearDelta = 0 -> Semester = 2 * 0 + 1 = 1
      calculatedSemester = 2 * yearDelta + 1;
      const nextYearShort = String(refYear + 1).slice(-2);
      academicYearStr = `${refYear}-${nextYearShort}`;
      termLabel = `Monsoon (Odd) ${refYear}`;
    } else {
      // e.g. Admitted 2024, in Feb 2026: yearDelta = 2 -> Semester = 2 * 2 = 4
      calculatedSemester = Math.max(1, 2 * yearDelta);
      const prevYear = refYear - 1;
      const curYearShort = String(refYear).slice(-2);
      academicYearStr = `${prevYear}-${curYearShort}`;
      termLabel = `Winter (Even) ${refYear}`;
    }

    // Clamp semester to standard university limits (1 to 8 for B.Tech)
    const currentSemester = Math.min(8, Math.max(1, calculatedSemester));

    // Default Section inference
    const defaultSection = '1';

    logger.debug('INFERENCE', `Inferred academic standing for ${clean}`, {
      admissionYear,
      branch: branchMeta.code,
      semester: currentSemester,
      academicYear: academicYearStr,
    });

    return {
      rollNo: clean,
      admissionYear,
      program,
      branchCode: branchMeta.code,
      branchName: branchMeta.name,
      currentSemester,
      academicYear: academicYearStr,
      defaultSection,
      isEvenSemester,
      termLabel,
    };
  }
}
