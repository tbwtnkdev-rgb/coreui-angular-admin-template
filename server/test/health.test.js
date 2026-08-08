import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, waitForDatabase } from '../src/db/pool.js';

/**
 * These talk to a real PostgreSQL. A mocked pool would only prove the mock
 * matches the assumptions in the test, which is the part most likely to be
 * wrong about the database.
 */
describe('health', () => {
  let pool;
  let server;
  let baseUrl;

  before(async () => {
    const config = loadConfig();
    pool = createPool(config.database);
    await waitForDatabase(pool, { attempts: 20, delayMs: 500 });

    // Port 0 asks the OS for a free port, so parallel runs cannot collide.
    server = createApp({ pool, config }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it('reports the database as reachable', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.database.reachable, true);
    assert.ok(body.database.latencyMs >= 0);
  });

  it('answers 404 as JSON rather than an HTML error page', async () => {
    const response = await fetch(`${baseUrl}/api/nothing-here`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.match(body.error.message, /No route for GET/);
  });

  it('does not advertise the framework', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  it('reads the seeded schema', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS days FROM revenue_daily');
    assert.equal(rows[0].days, 90, 'the seed should have loaded 90 days of revenue');
  });
});
