-- Analytics tables for the overview page.
--
-- Daily grain throughout. One row per day per dimension, with the grain itself
-- as the primary key, so a re-run of an import updates rather than duplicates.
-- "Unlikely to double-insert" is not the same as "cannot".

BEGIN;

CREATE TABLE channels (
    id       smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code     text NOT NULL UNIQUE,
    name     text NOT NULL,
    -- Fixed display order. Categorical colour is assigned by slot, so the
    -- order a chart paints in has to be a property of the data, not of
    -- whatever order the rows happened to come back in.
    position smallint NOT NULL UNIQUE
);

CREATE TABLE channel_sessions_daily (
    day        date NOT NULL,
    channel_id smallint NOT NULL REFERENCES channels (id),
    sessions   integer NOT NULL CHECK (sessions >= 0),
    PRIMARY KEY (day, channel_id)
);

CREATE TABLE revenue_daily (
    day            date PRIMARY KEY,
    revenue_minor  bigint NOT NULL CHECK (revenue_minor >= 0),
    orders_count   integer NOT NULL CHECK (orders_count >= 0),
    currency       char(3) NOT NULL DEFAULT 'THB'
);

-- The overview always asks for a contiguous range ending today, so both range
-- scans want the day column leading. revenue_daily gets it from the primary
-- key; the sessions table needs it stated because its key leads on day already
-- but the range query filters day and groups by channel.
CREATE INDEX channel_sessions_day_idx ON channel_sessions_daily (day DESC);

COMMIT;
