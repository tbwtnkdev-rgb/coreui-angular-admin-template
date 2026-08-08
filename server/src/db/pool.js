import pg from 'pg';

const { Pool, types } = pg;

// `date` comes back as a JS Date in the server's timezone by default, which
// turns 2026-08-01 into 2026-07-31 for anyone west of UTC. These columns are
// calendar days, not instants, so keep them as the string Postgres sent.
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value) => value);

// bigint arrives as a string so precision is never silently lost. Money is
// stored in minor units and stays well inside Number range, so the callers
// that need arithmetic convert explicitly rather than the driver guessing.
const INT8_OID = 20;
types.setTypeParser(INT8_OID, (value) => Number.parseInt(value, 10));

export const createPool = (config) => {
  const pool = new Pool(config);

  // An idle client erroring is not tied to any request, so without this the
  // process takes an unhandled 'error' event and exits.
  pool.on('error', (error) => {
    console.error('[db] idle client error:', error.message);
  });

  return pool;
};

/**
 * Waits for the database to accept queries.
 *
 * Compose health checks cover the usual case, but a container restart or a
 * failover can still put the API in front of a database that is not ready.
 * Retrying beats crash-looping and hoping the scheduler sorts it out.
 */
export const waitForDatabase = async (pool, { attempts = 10, delayMs = 1000 } = {}) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(`Database unreachable after ${attempts} attempts: ${error.message}`);
      }
      console.warn(`[db] not ready (attempt ${attempt}/${attempts}): ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};
