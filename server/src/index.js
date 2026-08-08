import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, waitForDatabase } from './db/pool.js';

const config = loadConfig();
const pool = createPool(config.database);

await waitForDatabase(pool);

const app = createApp({ pool, config });
const server = app.listen(config.port, () => {
  console.log(`[api] listening on ${config.port}`);
});

/**
 * Stop accepting connections, let in-flight requests finish, then release the
 * pool. Exiting immediately on SIGTERM drops requests that were already being
 * served, which during a rolling deploy means real user-facing errors.
 */
const shutdown = (signal) => {
  console.log(`[api] ${signal} received, shutting down`);

  const timer = setTimeout(() => {
    console.error('[api] shutdown timed out, exiting');
    process.exit(1);
  }, 10_000);
  timer.unref();

  server.close(async () => {
    await pool.end();
    clearTimeout(timer);
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
