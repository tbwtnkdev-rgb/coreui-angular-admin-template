-- Analytics table assertions. Same rule as the schema tests: assert the
-- constraints, not the happy path.

\set ON_ERROR_STOP on

DO $$
BEGIN
    ASSERT (SELECT count(*) FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('channels', 'channel_sessions_daily', 'revenue_daily')) = 3,
        'expected all three analytics tables';
END $$;

-- The daily grain must make a duplicate impossible, not merely unlikely.
DO $$
DECLARE
    chan_id  smallint;
    rejected boolean := false;
BEGIN
    INSERT INTO channels (code, name, position) VALUES ('test', 'Test', 999)
    RETURNING id INTO chan_id;

    INSERT INTO channel_sessions_daily (day, channel_id, sessions)
    VALUES (DATE '2026-01-01', chan_id, 100);

    BEGIN
        INSERT INTO channel_sessions_daily (day, channel_id, sessions)
        VALUES (DATE '2026-01-01', chan_id, 200);
    EXCEPTION WHEN unique_violation THEN
        rejected := true;
    END;

    ASSERT rejected, 'a second row for the same day and channel should violate the primary key';

    DELETE FROM channel_sessions_daily WHERE channel_id = chan_id;
    DELETE FROM channels WHERE id = chan_id;
END $$;

-- Two channels must not be able to claim the same paint order.
DO $$
DECLARE
    rejected boolean := false;
BEGIN
    INSERT INTO channels (code, name, position) VALUES ('pos_a', 'Pos A', 998);

    BEGIN
        INSERT INTO channels (code, name, position) VALUES ('pos_b', 'Pos B', 998);
    EXCEPTION WHEN unique_violation THEN
        rejected := true;
    END;

    ASSERT rejected, 'position should be unique so chart slot order is deterministic';

    DELETE FROM channels WHERE code IN ('pos_a', 'pos_b');
END $$;

-- Negative revenue is not a state worth being able to reach.
DO $$
DECLARE
    rejected boolean := false;
BEGIN
    BEGIN
        INSERT INTO revenue_daily (day, revenue_minor, orders_count)
        VALUES (DATE '2026-01-01', -1, 0);
    EXCEPTION WHEN check_violation THEN
        rejected := true;
    END;

    ASSERT rejected, 'negative revenue_minor should violate the check constraint';
END $$;

-- A sessions row must not survive its channel disappearing.
DO $$
DECLARE
    chan_id  smallint;
    rejected boolean := false;
BEGIN
    INSERT INTO channels (code, name, position) VALUES ('fk_test', 'FK Test', 997)
    RETURNING id INTO chan_id;
    INSERT INTO channel_sessions_daily (day, channel_id, sessions)
    VALUES (DATE '2026-02-01', chan_id, 5);

    BEGIN
        DELETE FROM channels WHERE id = chan_id;
    EXCEPTION WHEN foreign_key_violation THEN
        rejected := true;
    END;

    ASSERT rejected, 'deleting a channel with sessions should violate the foreign key';

    DELETE FROM channel_sessions_daily WHERE channel_id = chan_id;
    DELETE FROM channels WHERE id = chan_id;
END $$;

SELECT 'analytics tests passed' AS result;
