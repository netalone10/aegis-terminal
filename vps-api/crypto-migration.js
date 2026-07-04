const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aegis_terminal',
  user: 'aegis',
  password: 'aegis_terminal_2026',
});

const migration = `
-- Candle data from Bybit WebSocket
CREATE TABLE IF NOT EXISTS crypto_candles (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  open DECIMAL(18,8) NOT NULL,
  high DECIMAL(18,8) NOT NULL,
  low DECIMAL(18,8) NOT NULL,
  close DECIMAL(18,8) NOT NULL,
  volume DECIMAL(18,8) NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(symbol, timeframe, timestamp)
);

-- Generated signals
CREATE TABLE IF NOT EXISTS crypto_signals (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  bias VARCHAR(10) NOT NULL,
  confidence INTEGER NOT NULL,
  price DECIMAL(18,8) NOT NULL,
  structure JSONB NOT NULL,
  technical JSONB NOT NULL,
  volume JSONB NOT NULL,
  setups JSONB NOT NULL,
  confluence_score INTEGER NOT NULL,
  reasoning TEXT NOT NULL,
  status VARCHAR(10) DEFAULT 'active',
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Screening results (audit log)
CREATE TABLE IF NOT EXISTS crypto_screening (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  scan_time TIMESTAMP NOT NULL,
  signal_generated BOOLEAN DEFAULT FALSE,
  signal_id INTEGER REFERENCES crypto_signals(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Top 10 coins cache
CREATE TABLE IF NOT EXISTS crypto_top_coins (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  rank INTEGER NOT NULL,
  volume_24h DECIMAL(18,8) NOT NULL,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crypto_candles_symbol_tf 
  ON crypto_candles(symbol, timeframe, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_signals_symbol 
  ON crypto_signals(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_signals_status 
  ON crypto_signals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_screening_symbol 
  ON crypto_screening(symbol, scan_time DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_top_coins_rank 
  ON crypto_top_coins(rank);
`;

async function runMigration() {
  try {
    console.log('Running crypto schema migration...');
    await pool.query(migration);
    console.log('Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
