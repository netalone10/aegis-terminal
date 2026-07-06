// perf-migration.js — Tables for performance tracking + adaptive scoring

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026',
});

const migration = `
-- Performance reports (daily snapshots)
CREATE TABLE IF NOT EXISTS crypto_performance_reports (
  id SERIAL PRIMARY KEY,
  report_data JSONB NOT NULL,
  period_days INTEGER NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Adaptive weights (evolution over time)
CREATE TABLE IF NOT EXISTS adaptive_weights (
  id SERIAL PRIMARY KEY,
  weights JSONB NOT NULL,
  sample_size INTEGER NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_perf_reports_date
  ON crypto_performance_reports(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_adaptive_weights_date
  ON adaptive_weights(generated_at DESC);

-- Extend crypto_signals with more tracking columns
ALTER TABLE crypto_signals
ADD COLUMN IF NOT EXISTS confluence JSONB,
ADD COLUMN IF NOT EXISTS adjustments JSONB;
`;

async function run() {
  try {
    console.log('Running performance migration...');
    await pool.query(migration);
    console.log('Migration complete!');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    await pool.end();
    process.exit(1);
  }
}

run();
