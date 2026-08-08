import express from 'express';

import { errorHandler, notFoundHandler, route } from './middleware/errors.js';

/**
 * Builds the app around an injected pool so tests can hand in their own
 * connection rather than reaching for module state.
 */
export const createApp = ({ pool, config }) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get(
    '/api/health',
    route(async (req, res) => {
      // A health check that only proves the process is running will report
      // healthy while every request fails on the database.
      const started = process.hrtime.bigint();
      await pool.query('SELECT 1');
      const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;

      res.json({
        status: 'ok',
        database: { reachable: true, latencyMs: Math.round(latencyMs * 100) / 100 },
        uptimeSeconds: Math.round(process.uptime())
      });
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
