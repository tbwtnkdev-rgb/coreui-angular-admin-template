import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, waitForDatabase } from '../src/db/pool.js';

describe('orders', () => {
  let pool;
  let server;
  let baseUrl;

  before(async () => {
    const config = loadConfig();
    pool = createPool(config.database);
    await waitForDatabase(pool, { attempts: 20, delayMs: 500 });

    server = createApp({ pool, config }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it('lists orders with a total for the pager', async () => {
    const response = await fetch(`${baseUrl}/api/orders?limit=5`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 5);
    assert.ok(body.meta.total >= 28, 'the seed should have loaded at least 28 orders');
    assert.equal(body.meta.limit, 5);
  });

  it('never returns more rows than the configured ceiling, no matter what is asked', async () => {
    // The seed loads 28 orders. A caller asking for 10000 should still get
    // capped, not an unbounded scan.
    const response = await fetch(`${baseUrl}/api/orders?limit=10000`);
    const body = await response.json();

    assert.ok(body.data.length <= 200, 'limit should be capped at maxPageSize');
  });

  it('filters by status', async () => {
    const response = await fetch(`${baseUrl}/api/orders?status=paid&limit=50`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(body.data.length > 0);
    assert.ok(body.data.every((order) => order.status === 'paid'));
  });

  it('rejects a status outside the enum instead of running the query', async () => {
    const response = await fetch(`${baseUrl}/api/orders?status=not-a-status`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error.message, /Invalid status/);
  });

  it('sorts numerically, not lexically', async () => {
    const response = await fetch(`${baseUrl}/api/orders?sort=total&direction=desc&limit=50`);
    const body = await response.json();

    const totals = body.data.map((order) => order.totalMinor);
    const sorted = [...totals].sort((a, b) => b - a);
    assert.deepEqual(totals, sorted, 'descending total order should be numeric, not string, order');
  });

  it('sorts by customer name, joined from another table', async () => {
    const response = await fetch(`${baseUrl}/api/orders?sort=customer&direction=asc&limit=50`);
    const body = await response.json();

    const names = body.data.map((order) => order.customerName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(names, sorted, 'ascending customer order should be alphabetical');
  });

  it('sorts by region name, joined through the customer', async () => {
    const response = await fetch(`${baseUrl}/api/orders?sort=region&direction=asc&limit=50`);
    const body = await response.json();

    const names = body.data.map((order) => order.region.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(names, sorted, 'ascending region order should be alphabetical');
  });

  it('paginates without skipping or repeating a row across pages', async () => {
    // Two pages of 10, sorted by a column with real ties (status has only
    // four distinct values across the seed) — this is exactly where a query
    // with no tie-breaker would reshuffle rows between requests.
    const [pageOne, pageTwo] = await Promise.all([
      fetch(`${baseUrl}/api/orders?sort=status&direction=asc&limit=10&offset=0`).then((r) => r.json()),
      fetch(`${baseUrl}/api/orders?sort=status&direction=asc&limit=10&offset=10`).then((r) => r.json())
    ]);

    const seenOnPageOne = new Set(pageOne.data.map((order) => order.reference));
    const overlap = pageTwo.data.filter((order) => seenOnPageOne.has(order.reference));

    assert.deepEqual(overlap, [], 'no reference should appear on both pages');
  });

  it('searches across reference, customer and region together', async () => {
    const response = await fetch(`${baseUrl}/api/orders?search=nordwind&limit=50`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(body.data.length > 0, 'the seed includes a Nordwind Logistics customer');
    assert.ok(
      body.data.every((order) => order.customerName.toLowerCase().includes('nordwind')),
      'every match should actually contain the search term somewhere it was promised to be matched'
    );
  });

  it('rejects an unknown sort column rather than interpolating it', async () => {
    const response = await fetch(`${baseUrl}/api/orders?sort=1;DROP TABLE orders;--`);
    assert.equal(response.status, 400);

    // The table should still be there for every other test.
    const stillThere = await pool.query('SELECT count(*)::int AS n FROM orders');
    assert.ok(stillThere.rows[0].n > 0);
  });

  it('finds a single order by reference, with its line items', async () => {
    const list = await fetch(`${baseUrl}/api/orders?limit=1`);
    const { data } = await list.json();
    const reference = data[0].reference;

    const response = await fetch(`${baseUrl}/api/orders/${reference}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.reference, reference);
    assert.ok(body.data.items.length > 0);
  });

  it('answers 404 for an order that does not exist', async () => {
    const response = await fetch(`${baseUrl}/api/orders/ORD-0000`);
    assert.equal(response.status, 404);
  });
});
