import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { CronService } from './services/cron.service.js';

const { app, sessionStore, masterTimetableService, upstreamMonitor } = createApp();

// Start background upstream health monitor
if (env.NODE_ENV !== 'test') {
  upstreamMonitor.start(300_000); // 5 minutes
}

const cronService = new CronService({
  masterTimetableService,
});

if (env.NODE_ENV === 'production') {
  cronService.start();
}

const server = app.listen(env.PORT, () => {
  logger.info('SERVER', `NS Cognito Telemetry Core listening on port ${env.PORT}`);
  logger.info('SERVER', `Environment: ${env.NODE_ENV} | Plumware Upstream: ${env.PLUMWARE_BASE_URL}`);
  logger.info('SERVER', `Ready to service academic telemetry requests at http://localhost:${env.PORT}/api`);
});

let isShuttingDown = false;

/**
 * Enterprise Graceful Termination Handler with 10-second drain window.
 */
async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('SERVER', `Received ${signal}. Draining active connections and initiating 10s graceful shutdown...`);

  // Halt background workers
  upstreamMonitor.stop();
  cronService.stop();

  // Close idle HTTP keep-alive connections
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }

  // Force termination watchdog: 10s ceiling
  const forceTimer = setTimeout(() => {
    logger.error('SERVER', 'Forced process exit: connections failed to drain within 10s window.');
    process.exit(1);
  }, 10_000);
  if (forceTimer.unref) forceTimer.unref();

  server.close(async () => {
    logger.info('SERVER', 'HTTP server connection pool successfully drained.');
    try {
      await sessionStore.destroy();
      logger.info('SERVER', 'Transient session cache securely released.');
    } catch (err: unknown) {
      logger.error(
        'SERVER',
        `Error during session cache teardown: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    clearTimeout(forceTimer);
    process.exit(0);
  });
}

process.on('SIGINT', () => void handleShutdown('SIGINT'));
process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('FATAL', `Uncaught exception encountered: ${err.message}`, { stack: err.stack });
  void handleShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  logger.error('FATAL', `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
