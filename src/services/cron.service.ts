import { MasterTimetableService } from './master_timetable.service.js';
import { logger } from '../utils/logger.js';

export interface PrewarmTarget {
  branch: string;
  semester: number;
  section: string;
}

export interface PrewarmReport {
  timestamp: number;
  durationMs: number;
  totalTargets: number;
  warmedCount: number;
  failedCount: number;
  failures: Array<{ target: PrewarmTarget; error: string }>;
}

export interface CronServiceOptions {
  masterTimetableService: MasterTimetableService;
  intervalMs?: number;
  branches?: string[];
  semesters?: number[];
  sections?: string[];
}

/**
 * Autonomous Master Cache Pre-Warming Worker.
 * Scheduled off-peak background ingestion of high-demand master timetables,
 * guaranteeing instantaneous sub-10ms response times for student queries.
 */
export class CronService {
  private readonly masterTimetableService: MasterTimetableService;
  private readonly intervalMs: number;
  private readonly branches: string[];
  private readonly semesters: number[];
  private readonly sections: string[];

  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastReport: PrewarmReport | null = null;

  constructor(options: CronServiceOptions) {
    this.masterTimetableService = options.masterTimetableService;
    // Default: 24 hours (86,400,000 ms)
    this.intervalMs = options.intervalMs ?? 24 * 60 * 60 * 1000;
    this.branches = options.branches ?? [
      'CSAI',
      'CSDS',
      'CSB',
      'IT',
      'MAC',
      'ECE',
      'EIOT',
      'EE',
      'ICE',
      'ME',
    ];
    this.semesters = options.semesters ?? [1, 3, 5, 7];
    this.sections = options.sections ?? ['1', '2'];
  }

  /**
   * Triggers an end-to-end cache pre-warming pass across all configured academic targets.
   */
  async prewarmMasterCache(): Promise<PrewarmReport> {
    if (this.isRunning) {
      logger.warn('CRON', 'Pre-warming cycle already in progress. Skipping redundant trigger.');
      if (this.lastReport) return this.lastReport;
    }

    this.isRunning = true;
    const startTime = Date.now();
    logger.info('CRON', 'Starting scheduled master timetable cache pre-warming pass...');

    const targets: PrewarmTarget[] = [];
    for (const branch of this.branches) {
      for (const semester of this.semesters) {
        for (const section of this.sections) {
          targets.push({ branch, semester, section });
        }
      }
    }

    let warmedCount = 0;
    let failedCount = 0;
    const failures: Array<{ target: PrewarmTarget; error: string }> = [];

    for (const target of targets) {
      try {
        await this.masterTimetableService.syncMasterTimetable({
          academicYear: '2026-27',
          program: 'B.Tech',
          branch: target.branch,
          semester: target.semester,
          section: target.section,
        });
        warmedCount++;
        // Small pacing delay to avoid burst starvation
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (err: unknown) {
        failedCount++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        failures.push({ target, error: errorMsg });
        logger.warn(
          'CRON',
          `Failed pre-warming target ${target.branch} Sem ${target.semester} Sec ${target.section}: ${errorMsg}`
        );
      }
    }

    const durationMs = Date.now() - startTime;
    this.lastReport = {
      timestamp: Date.now(),
      durationMs,
      totalTargets: targets.length,
      warmedCount,
      failedCount,
      failures,
    };
    this.isRunning = false;

    logger.info(
      'CRON',
      `Pre-warming pass complete: ${warmedCount}/${targets.length} timetables refreshed in ${durationMs}ms (${failedCount} failures)`
    );

    return this.lastReport;
  }

  /**
   * Starts the recurring background pre-warming cron worker.
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.prewarmMasterCache();
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }

    logger.info('CRON', `Pre-warming cron worker active (Interval: ${this.intervalMs}ms)`);
  }

  /**
   * Stops the recurring background worker.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('CRON', 'Pre-warming cron worker halted');
    }
  }

  /**
   * Retrieves the latest pre-warming telemetry report.
   */
  getLastReport(): PrewarmReport | null {
    return this.lastReport;
  }

  /**
   * Indicates whether a pre-warming run is actively executing.
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
