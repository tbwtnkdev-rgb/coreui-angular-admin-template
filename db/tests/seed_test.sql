-- Seed assertions.
--
-- The property that matters is idempotence: applying the seed twice must leave
-- the same rows. Everything downstream — reviewable screenshots, visual
-- regression, a reproducible demo — depends on it.

\set ON_ERROR_STOP on

-- Snapshot, re-apply, compare.
CREATE TEMP TABLE seed_counts_before AS
SELECT
    (SELECT count(*) FROM regions)                AS regions,
    (SELECT count(*) FROM channels)               AS channels,
    (SELECT count(*) FROM customers)              AS customers,
    (SELECT count(*) FROM orders)                 AS orders,
    (SELECT count(*) FROM order_items)            AS order_items,
    (SELECT count(*) FROM revenue_daily)          AS revenue_daily,
    (SELECT count(*) FROM channel_sessions_daily) AS sessions,
    (SELECT coalesce(sum(revenue_minor), 0) FROM revenue_daily) AS revenue_total;

\ir ../003_seed.sql

DO $$
DECLARE
    before seed_counts_before%ROWTYPE;
BEGIN
    SELECT * INTO before FROM seed_counts_before;

    ASSERT before.regions = (SELECT count(*) FROM regions), 'regions changed on re-apply';
    ASSERT before.channels = (SELECT count(*) FROM channels), 'channels changed on re-apply';
    ASSERT before.customers = (SELECT count(*) FROM customers), 'customers changed on re-apply';
    ASSERT before.orders = (SELECT count(*) FROM orders), 'orders changed on re-apply';
    ASSERT before.order_items = (SELECT count(*) FROM order_items), 'order_items changed on re-apply';
    ASSERT before.revenue_daily = (SELECT count(*) FROM revenue_daily), 'revenue_daily changed on re-apply';
    ASSERT before.sessions = (SELECT count(*) FROM channel_sessions_daily), 'sessions changed on re-apply';
    ASSERT before.revenue_total = (SELECT coalesce(sum(revenue_minor), 0) FROM revenue_daily),
        'revenue totals changed on re-apply';
END $$;

-- The shape the pages depend on.
DO $$
BEGIN
    ASSERT (SELECT count(*) FROM revenue_daily) = 90,
        'expected 90 days of revenue';
    ASSERT (SELECT count(*) FROM channel_sessions_daily) = 90 * 5,
        'expected 90 days across 5 channels';
    ASSERT (SELECT count(DISTINCT status) FROM orders) = 4,
        'expected all four order statuses present so the filter has something to filter';
    ASSERT (SELECT min(sessions) FROM channel_sessions_daily) >= 0,
        'sessions must never be negative';
    ASSERT NOT EXISTS (SELECT 1 FROM orders WHERE total_minor < 0),
        'orders must never carry a negative total';
    ASSERT NOT EXISTS (
        SELECT 1 FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
        WHERE i.order_id IS NULL
    ), 'every order should have at least one line';
END $$;

SELECT 'seed tests passed' AS result;
