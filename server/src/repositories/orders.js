/**
 * All data access for orders in one place, behind names that describe intent
 * rather than SQL shape. Every query is parameterised — string interpolation
 * into SQL is how the order list becomes an injection point.
 */

// Fully-qualified column expressions, not bare names: sorting by customer or
// region requires the joined table's alias, and keeping every allowed value
// pre-qualified here means the query builder below never assembles a column
// reference out of parts, only ever selects one whole string from this set.
const ALLOWED_SORT = new Set(['o.reference', 'c.name', 'r.name', 'o.placed_on', 'o.total_minor', 'o.status']);
const ALLOWED_STATUS = new Set(['paid', 'pending', 'refunded', 'failed']);

export const createOrdersRepository = (pool) => ({
  /**
   * @param {object} options
   * @param {string} [options.status] one of ALLOWED_STATUS
   * @param {string} [options.search] matched against reference, customer and region
   * @param {string} options.sort one of ALLOWED_SORT
   * @param {'asc'|'desc'} options.direction
   * @param {number} options.limit already clamped by the caller
   * @param {number} options.offset
   */
  async list({ status, search, sort, direction, limit, offset }) {
    if (!ALLOWED_SORT.has(sort)) {
      throw new Error(`Invalid sort column: ${sort}`);
    }
    if (status !== undefined && !ALLOWED_STATUS.has(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // Column names cannot be parameters, so `sort` and `direction` are
    // interpolated only after being checked against the allow-list above —
    // never against caller input directly. `o.id` is a secondary key so ties
    // in the sort column (two orders on the same day, two customers with the
    // same name) get a stable order; without it, LIMIT/OFFSET pagination can
    // reshuffle tied rows between pages and skip or repeat one.
    const orderBy = `${sort} ${direction === 'asc' ? 'ASC' : 'DESC'}, o.id ASC`;

    const clauses = [];
    const params = [];

    if (status) {
      params.push(status);
      clauses.push(`o.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(o.reference ILIKE $${params.length} OR c.name ILIKE $${params.length} OR r.name ILIKE $${params.length})`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT count(*)::int AS total
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN regions r ON r.id = c.region_id
       ${where}`,
      params
    );

    params.push(limit, offset);
    const rowsResult = await pool.query(
      `SELECT
         o.reference, o.placed_on, o.status, o.total_minor, o.currency,
         c.name AS customer_name, r.code AS region_code, r.name AS region_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN regions r ON r.id = c.region_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { rows: rowsResult.rows, total: countResult.rows[0].total };
  },

  async findByReference(reference) {
    const result = await pool.query(
      `SELECT
         o.reference, o.placed_on, o.status, o.total_minor, o.currency,
         c.name AS customer_name, r.code AS region_code, r.name AS region_name,
         json_agg(json_build_object(
           'lineNo', i.line_no,
           'description', i.description,
           'quantity', i.quantity,
           'unitPriceMinor', i.unit_price_minor
         ) ORDER BY i.line_no) AS items
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN regions r ON r.id = c.region_id
       LEFT JOIN order_items i ON i.order_id = o.id
       WHERE o.reference = $1
       GROUP BY o.id, c.name, r.code, r.name`,
      [reference]
    );

    return result.rows[0] ?? null;
  }
});
