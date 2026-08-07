-- Core schema: who ordered what, from where.
--
-- Applied by the Postgres image's init directory in filename order, so the
-- numeric prefix is load-bearing.

BEGIN;

-- An enum rather than a text column with a CHECK: an invalid status cannot be
-- written at all, and the type is visible to anything reading the catalogue.
CREATE TYPE order_status AS ENUM ('paid', 'pending', 'refunded', 'failed');

CREATE TABLE regions (
    id   smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL
);

CREATE TABLE customers (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       text NOT NULL,
    region_id  smallint NOT NULL REFERENCES regions (id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference   text NOT NULL UNIQUE,
    customer_id bigint NOT NULL REFERENCES customers (id),
    placed_on   date NOT NULL,
    status      order_status NOT NULL,
    -- Money in integer minor units. Floating point money is a bug that waits
    -- until someone reconciles a report and finds it short by a satang.
    total_minor bigint NOT NULL CHECK (total_minor >= 0),
    currency    char(3) NOT NULL DEFAULT 'THB'
);

CREATE TABLE order_items (
    order_id         bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    line_no          smallint NOT NULL,
    description      text NOT NULL,
    quantity         integer NOT NULL CHECK (quantity > 0),
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    PRIMARY KEY (order_id, line_no)
);

-- Indexes chosen from how the orders page actually queries: newest first,
-- filtered by status, joined to the customer's region.
CREATE INDEX orders_placed_on_idx ON orders (placed_on DESC);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_customer_idx ON orders (customer_id);
CREATE INDEX customers_region_idx ON customers (region_id);

COMMIT;
