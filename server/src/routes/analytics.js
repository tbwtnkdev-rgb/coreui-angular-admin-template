import { Router } from 'express';

import { badRequest, route } from '../middleware/errors.js';
import { isValidRange } from '../repositories/analytics.js';

const parseRange = (query) => {
  const range = query.range ?? '30d';
  if (!isValidRange(range)) {
    throw badRequest('Invalid range', { allowed: ['7d', '30d', '90d'] });
  }
  return range;
};

export const createAnalyticsRouter = ({ repository }) => {
  const router = Router();

  router.get(
    '/revenue',
    route(async (req, res) => {
      const range = parseRange(req.query);
      const rows = await repository.revenueSeries(range);

      res.json({
        data: rows.map((row) => ({
          day: row.day,
          revenueMinor: row.revenue_minor,
          ordersCount: row.orders_count
        })),
        meta: { range }
      });
    })
  );

  router.get(
    '/channels',
    route(async (req, res) => {
      const range = parseRange(req.query);
      const rows = await repository.channelTotals(range);

      res.json({
        data: rows.map((row) => ({ code: row.code, name: row.name, sessions: row.sessions })),
        meta: { range }
      });
    })
  );

  return router;
};
