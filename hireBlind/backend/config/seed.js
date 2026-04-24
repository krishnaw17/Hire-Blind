// backend/config/seed.js
// One-time script: creates tables and seeds demo users.
// Run with: node config/seed.js
const dotenv = require('dotenv');
dotenv.config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'recruiter')),
    created_at    TIMESTAMPTZ  DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS screening_sessions (
    id                   VARCHAR(64)  PRIMARY KEY,
    admin_id             UUID         REFERENCES users(id) ON DELETE SET NULL,
    job_title            VARCHAR(500),
    job_description      TEXT,
    resumes              JSONB        DEFAULT '[]'::jsonb,
    anonymised_resumes   JSONB        DEFAULT '[]'::jsonb,
    scored_candidates    JSONB        DEFAULT '[]'::jsonb,
    status               VARCHAR(50)  DEFAULT 'active',
    created_at           TIMESTAMPTZ  DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id            SERIAL       PRIMARY KEY,
    action        VARCHAR(100) NOT NULL,
    user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
    session_id    VARCHAR(64),
    details       JSONB        DEFAULT '{}'::jsonb,
    timestamp     TIMESTAMPTZ  DEFAULT NOW()
  );

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_audit_session   ON audit_log(session_id);
  CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action);
  CREATE INDEX IF NOT EXISTS idx_sessions_admin  ON screening_sessions(admin_id);
`;

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🔧 Creating tables...');
    await client.query(SCHEMA_SQL);
    console.log('✅ Tables created successfully');

    // Seed demo users (upsert to avoid duplicates on re-run)
    const SALT_ROUNDS = 10;
    const demoUsers = [
      { email: 'admin@hireblind.com',     password: 'admin123',     role: 'admin'     },
      { email: 'recruiter@hireblind.com',  password: 'recruiter123', role: 'recruiter' },
      { email: 'krishnawadhwa2@gmail.com', password: 'admin123',     role: 'admin'     },
    ];

    for (const user of demoUsers) {
      const hash = await bcrypt.hash(user.password, SALT_ROUNDS);

      await client.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $3`,
        [user.email, hash, user.role]
      );
      console.log(`  ✓ Seeded user: ${user.email} (${user.role})`);
    }

    console.log('\n🎉 Database seeded successfully!');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
