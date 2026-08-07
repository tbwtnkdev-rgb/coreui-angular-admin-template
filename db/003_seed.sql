-- Seed data.
--
-- Generated from fixed series rather than random values. A dashboard whose
-- numbers change on every reload cannot be reviewed, a screenshot of it means
-- nothing, and a visual regression check has nothing to compare against.
--
-- Every statement is idempotent, so applying this twice leaves the same rows.
-- The init directory only runs it once, but nobody should have to know that
-- before running it by hand.

BEGIN;

INSERT INTO regions (code, name) VALUES
    ('APAC', 'Asia Pacific'),
    ('EMEA', 'Europe, Middle East & Africa'),
    ('NA',   'North America'),
    ('LATAM','Latin America')
ON CONFLICT (code) DO NOTHING;

INSERT INTO channels (code, name, position) VALUES
    ('direct',  'Direct',         1),
    ('organic', 'Organic search', 2),
    ('referral','Referral',       3),
    ('email',   'Email',          4),
    ('social',  'Social',         5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO customers (name, region_id)
SELECT c.name, r.id
FROM (VALUES
    ('Nordwind Logistics', 'EMEA'),
    ('Kanda Foods',        'APAC'),
    ('Bluewave Studio',    'APAC'),
    ('Orchid Health',      'APAC'),
    ('Pathfinder Labs',    'NA'),
    ('Verde Market',       'LATAM'),
    ('Sunbelt Freight',    'NA'),
    ('Atlas Interiors',    'EMEA'),
    ('Copperline Media',   'NA'),
    ('Harbour Analytics',  'EMEA'),
    ('Tidepool Games',     'APAC'),
    ('Ridgeway Legal',     'EMEA')
) AS c(name, region_code)
JOIN regions r ON r.code = c.region_code
WHERE NOT EXISTS (SELECT 1 FROM customers x WHERE x.name = c.name);

-- 90 days ending 2026-08-01. A fixed end date, not now(): "the last 90 days"
-- would make every run produce different rows and defeat the point.
WITH days AS (
    SELECT generate_series(DATE '2026-05-04', DATE '2026-08-01', INTERVAL '1 day')::date AS day
),
shaped AS (
    SELECT
        day,
        -- A weekly rhythm plus a slow climb. Deterministic: the same day
        -- always produces the same number.
        (day - DATE '2026-05-04') AS n,
        EXTRACT(isodow FROM day) AS dow
    FROM days
)
INSERT INTO revenue_daily (day, revenue_minor, orders_count)
SELECT
    day,
    (
        4200000                                   -- base, in satang
        + n * 18000                               -- slow climb
        + (sin(n / 5.5) * 500000)::bigint         -- weekly wave
        - CASE WHEN dow >= 6 THEN 900000 ELSE 0 END  -- quieter weekends
    )::bigint,
    (
        610
        + (n * 2.4)::int
        + (sin(n / 5.5) * 70)::int
        - CASE WHEN dow >= 6 THEN 130 ELSE 0 END
    )::int
FROM shaped
ON CONFLICT (day) DO NOTHING;

-- Sessions per channel per day, shaped by the channel's own share.
WITH days AS (
    SELECT generate_series(DATE '2026-05-04', DATE '2026-08-01', INTERVAL '1 day')::date AS day
)
INSERT INTO channel_sessions_daily (day, channel_id, sessions)
SELECT
    d.day,
    c.id,
    (
        (620 - c.position * 95)                              -- share by slot
        + ((d.day - DATE '2026-05-04') * (6 - c.position))   -- each grows differently
        + (sin((d.day - DATE '2026-05-04') / 6.0) * 40)::int
    )::int
FROM days d
CROSS JOIN channels c
ON CONFLICT (day, channel_id) DO NOTHING;

-- Orders: one per day per customer rotation, referencing the seeded customers.
WITH days AS (
    SELECT generate_series(DATE '2026-07-05', DATE '2026-08-01', INTERVAL '1 day')::date AS day
),
numbered AS (
    SELECT day, row_number() OVER (ORDER BY day) AS n FROM days
),
picked AS (
    SELECT
        n.day,
        n.n,
        (SELECT id FROM customers ORDER BY id OFFSET ((n.n - 1) % 12) LIMIT 1) AS customer_id
    FROM numbered n
)
INSERT INTO orders (reference, customer_id, placed_on, status, total_minor)
SELECT
    'ORD-' || lpad((4800 + p.n)::text, 4, '0'),
    p.customer_id,
    p.day,
    -- A fixed rotation weighted towards paid, so the status filter has
    -- something to filter without the mix changing between runs.
    (ARRAY['paid','paid','paid','pending','refunded','failed']::order_status[])[((p.n - 1) % 6) + 1],
    (18000 + (p.n * 13700) % 520000)::bigint
FROM picked p
ON CONFLICT (reference) DO NOTHING;

INSERT INTO order_items (order_id, line_no, description, quantity, unit_price_minor)
SELECT
    o.id,
    1,
    'Subscription — monthly',
    1,
    o.total_minor
FROM orders o
ON CONFLICT (order_id, line_no) DO NOTHING;

COMMIT;
