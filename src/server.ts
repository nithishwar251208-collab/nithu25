import { createServer } from 'node:http';
import { config } from './config/index.ts';
import { handleRequest } from './routes/index.ts';
import { logger } from './utils/logger.ts';
import { dbService } from './database/db.ts';

// Verify database connection at startup
try {
  dbService.get('SELECT 1');
  logger.info('Database connectivity confirmed.');
} catch (err: any) {
  logger.error('FATAL: Database connection failed at startup', err);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err: any) {
    logger.error('Unhandled server error', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' }
      }));
    }
  }
});

// Bind to 0.0.0.0 in production so containers/VMs accept external traffic
server.listen(config.port, config.host, () => {
  const boundAddr = `http://${config.host}:${config.port}`;
  logger.info(`====================================================`);
  logger.info(`  Nithu25 Production Backend Server Running!`);
  logger.info(`  Environment: ${config.nodeEnv}`);
  logger.info(`  Listening:   ${boundAddr}`);
  logger.info(`  Health:      ${boundAddr}/health`);
  logger.info(`  Readiness:   ${boundAddr}/ready`);
  logger.info(`  API Docs:    ${boundAddr}/api/docs`);
  logger.info(`====================================================`);
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forceful shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

export { server };
