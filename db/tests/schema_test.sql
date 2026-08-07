-- Schema assertions. Run after the schema files; any failure aborts with a
-- non-zero exit so CI goes red rather than printing a warning nobody reads.
--
-- These test the constraints, not the happy path. A schema that accepts a
-- negative total or a made-up status is the problem worth catching.

\set ON_ERROR_STOP on

DO $$
BEGIN
    ASSERT (SELECT count(*) FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('regions', 'customers', 'orders', 'order_items')) = 4,
        'expected all four core tables';

    ASSERT (SELECT count(*) FROM pg_type WHERE typname = 'order_status') = 1,
        'expected the order_status enum';
END $$;

-- A negative total must be rejected.
DO $$
DECLARE
    region_id  smallint;
    cust_id    bigint;
    rejected   boolean := false;
BEGIN
    INSERT INTO regions (code, name) VALUES ('TEST', 'Test') RETURNING id INTO region_id;
    INSERT INTO customers (name, region_id) VALUES ('Test Co', region_id) RETURNING id INTO cust_id;

    BEGIN
        INSERT INTO orders (reference, customer_id, placed_on, status, total_minor)
        VALUES ('TEST-NEG', cust_id, DATE '2026-01-01', 'paid', -1);
    EXCEPTION WHEN check_violation THEN
        rejected := true;
    END;

    ASSERT rejected, 'a negative total_minor should violate the check constraint';
END $$;

-- An unknown status must be rejected by the type itself.
DO $$
DECLARE
    rejected boolean := false;
BEGIN
    BEGIN
        PERFORM 'not_a_status'::order_status;
    EXCEPTION WHEN invalid_text_representation THEN
        rejected := true;
    END;

    ASSERT rejected, 'order_status should reject an unknown value';
END $$;

-- Deleting an order must take its lines with it.
DO $$
DECLARE
    region_id smallint;
    cust_id   bigint;
    ord_id    bigint;
    remaining integer;
BEGIN
    INSERT INTO regions (code, name) VALUES ('TEST2', 'Test 2') RETURNING id INTO region_id;
    INSERT INTO customers (name, region_id) VALUES ('Cascade Co', region_id) RETURNING id INTO cust_id;
    INSERT INTO orders (reference, customer_id, placed_on, status, total_minor)
    VALUES ('TEST-CASCADE', cust_id, DATE '2026-01-01', 'paid', 1000) RETURNING id INTO ord_id;
    INSERT INTO order_items (order_id, line_no, description, quantity, unit_price_minor)
    VALUES (ord_id, 1, 'Widget', 2, 500);

    DELETE FROM orders WHERE id = ord_id;

    SELECT count(*) INTO remaining FROM order_items WHERE order_id = ord_id;
    ASSERT remaining = 0, 'order_items should cascade when the order is deleted';
END $$;

-- Leave the database as the tests found it.
DELETE FROM customers WHERE name IN ('Test Co', 'Cascade Co');
DELETE FROM regions WHERE code IN ('TEST', 'TEST2');

SELECT 'schema tests passed' AS result;
