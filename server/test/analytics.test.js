import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool, waitForDatabase } from '../src/db/pool.js';

describe('analytics', () => {
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

  it('returns exactly one revenue point per day in range', async () => {
    const response = await fetch(`${baseUrl}/api/analytics/revenue?range=7d`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 7);
  });

  it('a wider range returns more days, and revenue is never negative', async () => {
    const wide = await fetch(`${baseUrl}/api/analytics/revenue?range=90d`);
    const wideBody = await wide.json();

    assert.equal(wideBody.data.length, 90);
    assert.ok(wideBody.data.every((point) => point.revenueMinor >= 0));
  });

  it('rejects a range outside the allowed set', async () => {
    const response = await fetch(`${baseUrl}/api/analytics/revenue?range=365d`);
    assert.equal(response.status, 400);
  });

  it('returns channels in their fixed paint order, not alphabetical', async () => {
    const response = await fetch(`${baseUrl}/api/analytics/channels?range=30d`);
    const body = await response.json();

    assert.equal(response.status, 200);
    // Seeded order: direct, organic, referral, email, social — not
    // alphabetical. If this ever reads alphabetically, position ASC broke.
    assert.deepEqual(
      body.data.map((c) => c.code),
      ['direct', 'organic', 'referral', 'email', 'social']
    );
  });

  it('sums sessions across the window rather than returning the last day only', async () => {
    const week = await fetch(`${baseUrl}/api/analytics/channels?range=7d`);
    const quarter = await fetch(`${baseUrl}/api/analytics/channels?range=90d`);
    const weekBody = await week.json();
    const quarterBody = await quarter.json();

    const weekTotal = weekBody.data.reduce((sum, c) => sum + c.sessions, 0);
    const quarterTotal = quarterBody.data.reduce((sum, c) => sum + c.sessions, 0);

    assert.ok(quarterTotal > weekTotal, '90 days of sessions should sum higher than 7');
  });
});
