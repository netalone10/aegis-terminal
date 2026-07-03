-- Aegis Terminal — Full Schema Migration
-- Adds: economic calendar, fundamental bias, unified signals, correlation tracking
-- Updates: existing tables with fundamental fields

BEGIN;

-- ═══════════════════════════════════════════════════════════
-- NEW TABLES
-- ═══════════════════════════════════════════════════════════

-- Economic Events (seed data — static definitions)
CREATE TABLE IF NOT EXISTS economic_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    country VARCHAR(10) NOT NULL,
    impact_tier VARCHAR(2) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    release_day VARCHAR(10),
    release_time_utc TIME,
    affected_symbols TEXT[] NOT NULL,
    avg_move_pips JSONB,
    correlation_chain VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Event Releases (dynamic — actual data when released)
CREATE TABLE IF NOT EXISTS event_releases (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES economic_events(id),
    release_date DATE NOT NULL,
    consensus DECIMAL,
    previous DECIMAL,
    actual DECIMAL,
    revision_prev DECIMAL,
    surprise_pct DECIMAL,
    total_surprise DECIMAL,
    affected_pairs_move JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_releases_date ON event_releases(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_releases_event ON event_releases(event_id, release_date DESC);

-- Week Classifications (computed weekly)
CREATE TABLE IF NOT EXISTS week_classifications (
    id SERIAL PRIMARY KEY,
    week_start DATE NOT NULL,
    week_type VARCHAR(20),
    volatility_multiplier DECIMAL(3,2),
    max_positions INTEGER,
    stop_loss_widen DECIMAL(3,2),
    entry_rule VARCHAR(30),
    best_strategy VARCHAR(30),
    tier_counts JSONB,
    upcoming_events JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(week_start)
);

-- Fundamental Bias (per symbol, computed daily + on event)
CREATE TABLE IF NOT EXISTS fundamental_bias (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    bias_date DATE NOT NULL,
    bias VARCHAR(10),
    score DECIMAL(4,2),
    day_type VARCHAR(20),
    day_fundamental_weight DECIMAL(3,2),
    upcoming_events JSONB,
    event_proximity BOOLEAN DEFAULT FALSE,
    last_surprise DECIMAL(6,4),
    last_surprise_direction VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, bias_date)
);

-- Unified Signals (final merged output)
CREATE TABLE IF NOT EXISTS unified_signals (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(5),
    entry_price DECIMAL(12,5),
    stop_loss DECIMAL(12,5),
    take_profit DECIMAL(12,5),
    rr_ratio DECIMAL(5,2),
    layer1_score INTEGER,
    layer2_score INTEGER,
    layer3_score INTEGER,
    layer4_score INTEGER,
    fundamental_score INTEGER,
    smt_score INTEGER,
    total_confidence INTEGER,
    confluence_factors JSONB,
    week_type VARCHAR(20),
    event_proximity BOOLEAN,
    fundamental_bias VARCHAR(10),
    max_positions INTEGER,
    stop_adjustment DECIMAL(3,2),
    is_news_trade BOOLEAN DEFAULT FALSE,
    status VARCHAR(10) DEFAULT 'active',
    result VARCHAR(10),
    pnl_pips DECIMAL(10,2),
    pnl_r DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    activated_at TIMESTAMP,
    closed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_unified_symbol ON unified_signals(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_status ON unified_signals(status);

-- Correlation Snapshots
CREATE TABLE IF NOT EXISTS correlation_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_time TIMESTAMP NOT NULL,
    pair1 VARCHAR(20) NOT NULL,
    pair2 VARCHAR(20) NOT NULL,
    correlation DECIMAL(4,3),
    regime VARCHAR(20),
    lookback_hours INTEGER DEFAULT 24,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corr_time ON correlation_snapshots(snapshot_time DESC);

-- ═══════════════════════════════════════════════════════════
-- UPDATE EXISTING TABLES
-- ═══════════════════════════════════════════════════════════

-- weekly_profiles: add fundamental fields
ALTER TABLE weekly_profiles ADD COLUMN IF NOT EXISTS fundamental_bias VARCHAR(10);
ALTER TABLE weekly_profiles ADD COLUMN IF NOT EXISTS week_type VARCHAR(20);
ALTER TABLE weekly_profiles ADD COLUMN IF NOT EXISTS confidence INTEGER DEFAULT 0;

-- h4_signals: add h4_candle_time
ALTER TABLE h4_signals ADD COLUMN IF NOT EXISTS h4_candle_time TIMESTAMP;

-- entry_signals: add fundamental fields
ALTER TABLE entry_signals ADD COLUMN IF NOT EXISTS fundamental_bias VARCHAR(10);
ALTER TABLE entry_signals ADD COLUMN IF NOT EXISTS fundamental_weight DECIMAL(3,2);
ALTER TABLE entry_signals ADD COLUMN IF NOT EXISTS pnl_pips DECIMAL(10,2);
ALTER TABLE entry_signals ADD COLUMN IF NOT EXISTS pnl_r DECIMAL(5,2);

-- smt_signals: add result tracking
ALTER TABLE smt_signals ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE smt_signals ADD COLUMN IF NOT EXISTS result VARCHAR(20);

COMMIT;
