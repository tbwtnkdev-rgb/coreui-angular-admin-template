/**
 * Configuration is read once, validated once, and fails at startup.
 *
 * A service that boots with a missing setting and only discovers it on the
 * first request that needs it has turned a config error into an incident.
 */

const required = (name) => {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const optional = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const integer = (name, fallback) => {
  const raw = optional(name, String(fallback));
  const value = Number.parseInt(raw, 10);

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer, got: ${raw}`);
  }

  return value;
};

export const loadConfig = () => ({
  port: integer('PORT', 3000),
  database: {
    host: optional('PGHOST', 'localhost'),
    port: integer('PGPORT', 5432),
    database: optional('PGDATABASE', 'dashboard'),
    user: optional('PGUSER', 'dashboard'),
    // No fallback. A default database password is one that reaches production.
    password: required('PGPASSWORD'),
    // Keep the pool small: this API is read-mostly and a large pool only moves
    // the queue from the app into the database.
    max: integer('PGPOOL_MAX', 10),
    idleTimeoutMillis: integer('PGPOOL_IDLE_MS', 30_000),
    connectionTimeoutMillis: integer('PGPOOL_CONNECT_MS', 5_000)
  },
  /** Hard ceiling on any list endpoint, regardless of what a caller asks for. */
  maxPageSize: integer('MAX_PAGE_SIZE', 200)
});
