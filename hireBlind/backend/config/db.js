// backend/config/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Verify connection on startup
pool.on('connect', () => {
  console.log('📦 PostgreSQL client connected');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err.message);
});

/**
 * Run a parameterised query against the pool.
 * Usage: const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > 2000) {
    console.warn(`Slow query (${duration}ms): ${text.substring(0, 80)}`);
  }

  return result;
}

module.exports = { pool, query };
