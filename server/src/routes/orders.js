import { Router } from 'express';

import { badRequest, notFound, route } from '../middleware/errors.js';

// UI-facing key -> fully-qualified column the repository's allow-list
// recognises. Customer and region need the joined table's alias, which is
// why these are qualified here rather than left as bare column names.
const SORT_FIELDS = new Map([
  ['reference', 'o.reference'],
  ['customer', 'c.name'],
  ['region', 'r.name'],
  ['placed', 'o.placed_on'],
  ['total', 'o.total_minor'],
  ['status', 'o.status']
]);
const STATUSES = new Set(['paid', 'pending', 'refunded', 'failed']);

const parseListQuery = (query, maxPageSize) => {
  const status = query.status;
  if (status !== undefined && !STATUSES.has(status)) {
    throw badRequest('Invalid status', { allowed: [...STATUSES] });
  }

  const sortKey = query.sort ?? 'placed';
  const sortColumn = SORT_FIELDS.get(sortKey);
  if (!sortColumn) {
    throw badRequest('Invalid sort', { allowed: [...SORT_FIELDS.keys()] });
  }

  const direction = query.direction === 'asc' ? 'asc' : 'desc';

  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : undefined;

  const rawLimit = Number.parseInt(query.limit, 10);
  // A hard ceiling regardless of what the caller asks for — an unbounded
  // query is a request nobody should be able to make.
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, maxPageSize)
    : Math.min(20, maxPageSize);

  const rawOffset = Number.parseInt(query.offset, 10);
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  return { status, search, sort: sortColumn, direction, limit, offset };
};

const toApiOrder = (row) => ({
  reference: row.reference,
  placedOn: row.placed_on,
  status: row.status,
  totalMinor: row.total_minor,
  currency: row.currency,
  customerName: row.customer_name,
  region: { code: row.region_code, name: row.region_name }
});

export const createOrdersRouter = ({ repository, maxPageSize }) => {
  const router = Router();

  router.get(
    '/',
    route(async (req, res) => {
      const options = parseListQuery(req.query, maxPageSize);
      const { rows, total } = await repository.list(options);

      res.json({
        data: rows.map(toApiOrder),
        meta: { total, limit: options.limit, offset: options.offset }
      });
    })
  );

  router.get(
    '/:reference',
    route(async (req, res) => {
      const order = await repository.findByReference(req.params.reference);
      if (!order) throw notFound(`No order with reference ${req.params.reference}`);

      res.json({
        data: {
          ...toApiOrder(order),
          items: (order.items ?? []).filter((item) => item !== null)
        }
      });
    })
  );

  return router;
};
