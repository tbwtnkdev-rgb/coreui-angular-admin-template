/**
 * Read access for the overview page: revenue and channel sessions over a
 * range of days.
 */

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

export const isValidRange = (range) => Object.hasOwn(RANGE_DAYS, range);

export const createAnalyticsRepository = (pool) => ({
  /** Revenue and order count per day, oldest first, for the trailing window. */
  async revenueSeries(range) {
    const days = RANGE_DAYS[range];

    const result = await pool.query(
      `SELECT day, revenue_minor, orders_count
       FROM revenue_daily
       WHERE day > (SELECT max(day) FROM revenue_daily) - $1::int
       ORDER BY day ASC`,
      [days]
    );

    return result.rows;
  },

  /** Sessions per channel, summed over the window, in the channel's fixed paint order. */
  async channelTotals(range) {
    const days = RANGE_DAYS[range];

    const result = await pool.query(
      `SELECT c.code, c.name, coalesce(sum(s.sessions), 0)::int AS sessions
       FROM channels c
       LEFT JOIN channel_sessions_daily s
         ON s.channel_id = c.id
        AND s.day > (SELECT max(day) FROM channel_sessions_daily) - $1::int
       GROUP BY c.id, c.code, c.name, c.position
       ORDER BY c.position ASC`,
      [days]
    );

    return result.rows;
  }
});
