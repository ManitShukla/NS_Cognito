import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const { app, sessionStore } = createApp();

const server = app.listen(env.PORT, () => {
  logger.info('SERVER', `NS Cognito Telemetry Core listening on port ${env.PORT}`);
  logger.info('SERVER', `Environment: ${env.NODE_ENV} | Plumware Upstream: ${env.PLUMWARE_BASE_URL}`);
  logger.info('SERVER', `Ready to service academic telemetry requests at http://localhost:${env.PORT}/api`);
});

/**
 * Graceful termination handler
 */
async function handleShutdown(signal: string) {
  logger.info('SERVER', `Received ${signal}. Draining connections and initiating shutdown...`);

  server.close(async () => {
    logger.info('SERVER', 'HTTP server successfully closed.');
    try {
      await sessionStore.destroy();
      logger.info('SERVER', 'Transient session cache released.');
    } catch (err) {
      logger.error('SERVER', 'Error during session cache cleanup:', err);
    }
    process.exit(0);
  });

  // Force shutdown if connections do not drain within 5 seconds
  setTimeout(() => {
    logger.error('SERVER', 'Forced shutdown initiated after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
