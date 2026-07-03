# Aegis Terminal — Unified Implementation Plan
## Technical (ICT 4-Layer) × Fundamental (Economic Calendar) Integration

> References: `FRAMEWORK_SPEC.md` + `FUNDAMENTAL_SPEC.md`
> Infrastructure: VPS PostgreSQL + CF Workers API + CF Pages Frontend
> Symbols: XAUUSD, EURUSD, GBPUSD, USDJPY, BTCUSD

---

## ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────┐
│                        DATA LAYER (VPS)                          │
│  PostgreSQL: aegis_terminal                                       │
│  ├── technical tables (weekly_profiles, h4_signals, etc.)        │
│  ├── fundamental tables (economic_events, event_releases)        │
│  ├── candle data (historical_ohlc — MT5 candles)                 │
│  └── signal output (unified_signals, signal_results)             │
├──────────────────────────────────────────────────────────────────┤
│                     ENGINE LAYER (VPS / CF Workers)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │ Candle Engine │  │ Fundamental  │  │ Confluence       │       │
│  │ (MT5 → OHLCV) │  │ Engine       │  │ Engine           │       │
│  │               │  │ (Calendar +  │  │ (Tech + Fund +   │       │
│  │ Weekly Prof   │  │  Chains +    │  │  SMT + Cross-    │       │
│  │ H4 Profiling  │  │  Week Type)  │  │  Asset Corr)     │       │
│  │ H1 Confirm    │  │              │  │                  │       │
│  │ M15 Entry     │  │              │  │                  │       │
│  └──────────────┘  └──────────────┘  └──────────────────┘       │
│         ↓                   ↓                  ↓                  │
│  ┌──────────────────────────────────────────────────────┐        │
│  │              UNIFIED SIGNAL GENERATOR                 │        │
│  │  Technical Layer + Fundamental Filter + SMT + R:R     │        │
│  │  → Final Signal (direction, entry, sl, tp, conf)     │        │
│  └──────────────────────────────────────────────────────┘        │
├──────────────────────────────────────────────────────────────────┤
│                      API LAYER (CF Workers)                       │
│  GET /api/unified-signal/:symbol                                 │
│  GET /api/weekly-profile/:symbol                                 │
│  GET /api/fundamental-context/:symbol                            │
│  GET /api/economic-calendar/:date                                │
│  GET /api/signals/history/:symbol/stats                          │
├──────────────────────────────────────────────────────────────────┤
│                    FRONTEND LAYER (CF Pages)                      │
│  /signals — Unified signal display (all 4 layers + fundamental)  │
│  /calendar — Economic calendar with week type + event history    │
│  /dashboard — Multi-symbol overview with bias + alerts           │
└──────────────────────────────────────────────────────────────────┘
```

---

## PHASE 0: DATA FOUNDATION (Week 1-2)

### Goal: Candle data + Economic calendar data flowing into PostgreSQL

### Backend: Data Ingestion

#### 0A. MT5 Candle Ingestion Service

**Location:** VPS cron job + API endpoint

```sql
-- Candle data storage (PostgreSQL)
CREATE TABLE historical_ohlc (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(5) NOT NULL,           -- 'M15','H1','H4','D1','W1'
    open_time TIMESTAMP NOT NULL,
    open DECIMAL(12,5) NOT NULL,
    high DECIMAL(12,5) NOT NULL,
    low DECIMAL(12,5) NOT NULL,
    close DECIMAL(12,5) NOT NULL,
    volume BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, timeframe, open_time)
);

CREATE INDEX idx_ohlc_lookup ON historical_ohlc(symbol, timeframe, open_time DESC);
```

**Cron: Every 5 minutes (M15), every hour (H1, H4), daily (D1, W1)**
```bash
# MT5 Data Feed → PostgreSQL
# Source: MT5 API or broker data feed
# Target: historical_ohlc table
# Rate: M15 every 5min, H1 hourly, H4 every 4h, D1 daily, W1 weekly
```

**API Endpoint:**
```
POST /api/candles/:symbol/:timeframe
Body: { candles: [{ open_time, open, high, low, close, volume }] }
Response: { inserted: number, updated: number }
```

#### 0B. Economic Calendar Ingestion

**Location:** VPS cron job (weekly fetch + daily updates)

```sql
-- Event definitions (static, seed once)
CREATE TABLE economic_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    country VARCHAR(10) NOT NULL,
    impact_tier VARCHAR(2) NOT NULL,         -- 'S+','S','A','B','C','D'
    frequency VARCHAR(20) NOT NULL,
    release_day VARCHAR(10),
    release_time_utc TIME NOT NULL,
    affected_symbols TEXT[] NOT NULL,
    avg_move_pips JSONB,
    correlation_chain VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Actual releases (dynamic, updated daily)
CREATE TABLE event_releases (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES economic_events(id),
    release_date DATE NOT NULL,
    consensus DECIMAL,
    previous DECIMAL,
    actual DECIMAL,
    revision_prev DECIMAL,
    surprise_pct DECIMAL,                    -- (actual - consensus) / consensus
    total_surprise DECIMAL,
    affected_pairs_move JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_releases_date ON event_releases(release_date DESC);
CREATE INDEX idx_releases_event ON event_releases(event_id, release_date DESC);
```

**Seed Data: Core economic events (20-30 events)**
```javascript
const EVENTS = [
  { name: "Non-Farm Payrolls", country: "US", tier: "S", frequency: "monthly", day: "fri", time: "08:30 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"], chain: "employment" },
  { name: "CPI (YoY)", country: "US", tier: "A", frequency: "monthly", day: "tue", time: "08:30 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"], chain: "inflation" },
  { name: "Core CPI (MoM)", country: "US", tier: "A", frequency: "monthly", day: "tue", time: "08:30 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"], chain: "inflation" },
  { name: "FOMC Rate Decision", country: "US", tier: "S+", frequency: "quarterly", day: "wed", time: "14:00 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"], chain: "rate" },
  { name: "FOMC Minutes", country: "US", tier: "A", frequency: "monthly", day: "wed", time: "14:00 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"], chain: "rate" },
  { name: "Core PCE Price Index", country: "US", tier: "A", frequency: "monthly", day: "fri", time: "08:30 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD"], chain: "inflation" },
  { name: "ISM Manufacturing PMI", country: "US", tier: "B", frequency: "monthly", day: "mon", time: "10:00 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD"], chain: "growth" },
  { name: "ISM Services PMI", country: "US", tier: "B", frequency: "monthly", day: "wed", time: "10:00 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD"], chain: "growth" },
  { name: "Initial Jobless Claims", country: "US", tier: "B", frequency: "weekly", day: "thu", time: "08:30 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD"], chain: "employment" },
  { name: "ADP Employment Change", country: "US", tier: "B", frequency: "monthly", day: "wed", time: "08:15 UTC", symbols: ["EURUSD","GBPUSD","USDJPY","XAUUSD"], chain: "employment" },
  { name: "Retail Sales (MoM)", country: "US", tier: "B", frequency: "monthly", day: "thu", time: "08:30 UTC", symbols: ["EURUSD","GBPUSD","USDJPY"], chain: "growth" },
  { name: "GDP (Advance)", country: "US", tier: "C", frequency: "quarterly", day: "thu", time: "08:30 UTC", symbols: ["EURUSD","GBPUSD","USDJPY"], chain: "growth" },
  { name: "ECB Rate Decision", country: "EU", tier: "A", frequency: "quarterly", day: "thu", time: "08:15 UTC", symbols: ["EURUSD","GBPUSD"], chain: "rate" },
  { name: "BOE Rate Decision", country: "UK", tier: "A", frequency: "quarterly", day: "thu", time: "07:00 UTC", symbols: ["GBPUSD"], chain: "rate" },
  { name: "BOJ Rate Decision", country: "JP", tier: "A", frequency: "quarterly", day: "fri", time: "23:00 UTC", symbols: ["USDJPY"], chain: "rate" },
  // ... more events
];
```

**Cron: Weekly fetch from ForexFactory/Investing.com API, daily actuals update**
```bash
# Every Sunday 22:00 UTC: fetch next week's events
# Every 30 min during trading hours: check for new actuals
```

---

## PHASE 1: TECHNICAL ENGINE — WEEKLY PROFILE (Week 2-3)

### Goal: Automated weekly profile generation per symbol

### Backend: Weekly Profile Engine

**Location:** VPS service, runs every Sunday 22:00 UTC + on-demand

```sql
-- Weekly profiles (PostgreSQL)
CREATE TABLE weekly_profiles (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_start DATE NOT NULL,
    model VARCHAR(30),                        -- 'classic_expansion' | 'consolidation_reversal' | 'midweek_reversal'
    bias VARCHAR(10),                         -- 'bullish' | 'bearish' | 'neutral'
    sequence VARCHAR(5),                      -- 'OLHC' | 'OHLC'
    confidence INTEGER DEFAULT 0,
    monday_open DECIMAL(12,5),
    monday_high DECIMAL(12,5),
    monday_low DECIMAL(12,5),
    monday_close DECIMAL(12,5),
    week_high DECIMAL(12,5),
    week_low DECIMAL(12,5),
    day_rankings JSONB,                       -- [{ day, score, highProb, reason }]
    fundamental_bias VARCHAR(10),             -- from FUNDAMENTAL_SPEC week type
    week_type VARCHAR(20),                    -- 'HIGH_IMPACT' | 'MEDIUM' | 'LOW'
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, week_start)
);
```

**Engine Logic:**
```
1. Fetch W1 candle (current week + previous 2 weeks)
2. Fetch D1 candles (5 per week)
3. Detect model:
   - Classic: Mon open, Tue makes weekly extreme, Wed-Thu expand
   - Consolidation: Mon-Wed sideways, Thu extreme, Fri reverses
   - Midweek: Mon-Tue sideways, Wed extreme, Thu-Fri reverse
4. Detect OHLC sequence: close > open = OLHC (bullish), else OHLC (bearish)
5. Rank days 1-5 based on:
   - News events (fundamental layer input)
   - Model position (e.g., reversal day in midweek model = high score)
   - Historical day-of-week performance
6. Calculate confidence: 0-100 based on model clarity + fundamental alignment
```

**API Endpoint:**
```
GET /api/weekly-profile/:symbol
Response: {
  symbol: string,
  model: 'classic_expansion' | 'consolidation_reversal' | 'midweek_reversal',
  bias: 'bullish' | 'bearish' | 'neutral',
  sequence: 'OLHC' | 'OHLC',
  confidence: number,
  weekHigh: number,
  weekLow: number,
  dayRankings: [{ day, score, highProb, reason }],
  weekType: 'HIGH_IMPACT' | 'MEDIUM_IMPACT' | 'LOW_IMPACT',
  fundamentalBias: string,
  timestamp: number
}
```

### Frontend: Weekly Profile Card

**Location:** `frontend/src/modules/signals/components/WeeklyProfileCard.tsx`

```
┌─────────────────────────────────────┐
│ WEEKLY PROFILE: XAUUSD             │
│ Model: Midweek Reversal            │
│ Bias: Bullish (OLHC)  Conf: 82%   │
│ Week Type: HIGH IMPACT (FOMC)      │
├─────────────────────────────────────┤
│ Day Rankings:                       │
│ Tue: ★★★★☆ (continuation)         │
│ Wed: ★★★★★ (reversal + FOMC)      │
│ Thu: ★★★★☆ (expansion)            │
│ Fri: ★★☆☆☆ (NFP — avoid)         │
├─────────────────────────────────────┤
│ Fundamental: FOMC week → widen SL   │
│ Max positions: 2                    │
└─────────────────────────────────────┘
```

---

## PHASE 2: TECHNICAL ENGINE — H4 PROFILING (Week 3-4)

### Goal: Real-time H4 signal detection per killzone

### Backend: H4 Profiling Engine

**Location:** VPS service, polls H4 candles every 15 minutes

```sql
CREATE TABLE h4_signals (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    h4_candle_time TIMESTAMP NOT NULL,
    model INTEGER,                           -- 1, 2, 3, 4
    trigger_type VARCHAR(30),
    killzone VARCHAR(30),
    h1_time VARCHAR(20),
    bias VARCHAR(10),
    key_level DECIMAL(12,5),                 -- red dot / sweep level
    confidence INTEGER,
    confirmed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Killzone Schedule (UTC):**
```
London Open:  13:00-17:00 UTC (H4 candle 1)
London Lunch: 17:00-21:00 UTC (H4 candle 2)
New York:     21:00-01:00 UTC (H4 candle 3)
Asia:         01:00-05:00 UTC (H4 candle 4) — skip
London Pre:   05:00-09:00 UTC (H4 candle 5) — skip
London Mid:   09:00-13:00 UTC (H4 candle 6) — skip
```

**H4 Model Detection (per killzone candle):**
```
Model 1: Candles 1-4 form structure, candle 5 sweeps + reverses → RED DOT
Model 2: Candles 1-8 form structure, candle 9 continues → NO SWEEP
Model 3: Candles 1-8 form structure, candle 9 sweeps + reverses → RED DOT
Model 4: Candle 1 is reversal, candles 2-4 confirm → RED DOT
```

**API Endpoint:**
```
GET /api/h4-profile/:symbol
Response: {
  symbol: string,
  activeKillzone: { name, h4Time, wibTime, session, priority },
  signals: H4Signal[],
  profilingPhase: 'monitor' | 'validate',
  timestamp: number
}
```

### Frontend: H4 Signal Card

```
┌─────────────────────────────────────┐
│ H4 SIGNAL: XAUUSD                  │
│ Killzone: London Open (13:00 UTC)  │
│ Model: Type 1 (Candle 5 Reversal)  │
│ Bias: Bearish  Key: 3245.00        │
│ Phase: Monitoring... ⏳            │
├─────────────────────────────────────┤
│ Next: London Lunch (17:00) → H1    │
└─────────────────────────────────────┘
```

---

## PHASE 3: TECHNICAL ENGINE — H1 CONFIRMATION (Week 4-5)

### Goal: Validate H4 signals with H1 OH/OL structure

### Backend: H1 Confirmation Engine

```sql
CREATE TABLE h1_confirmations (
    id SERIAL PRIMARY KEY,
    h4_signal_id INTEGER REFERENCES h4_signals(id),
    symbol VARCHAR(20) NOT NULL,
    confirmed BOOLEAN DEFAULT FALSE,
    confirmation_type VARCHAR(20),           -- 'reversal' | 'continue'
    model INTEGER,
    h1_candle_1_close DECIMAL(12,5),
    h1_candle_2_close DECIMAL(12,5),
    ohol_formed BOOLEAN,
    validation_hour INTEGER,
    confidence INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**OH/OL Detection:**
```
OH (Open-High): C1 close > C2 close → bearish confirmation
OL (Open-Low):  C1 close < C2 close → bullish confirmation
```

**API Endpoint:**
```
GET /api/h1-confirm/:symbol?h4SignalId=123
Response: {
  confirmed: boolean,
  confirmationType: 'reversal' | 'continue',
  model: number,
  h1Candles: Candle[],
  oholStructure: string,
  confidence: number
}
```

### Frontend: H1 Confirmation Card

```
┌─────────────────────────────────────┐
│ H1 CONFIRM: XAUUSD                 │
│ Status: ✅ Confirmed (Bullish)     │
│ OH/OL: OL formed (C1 < C2)        │
│ Model: Type 3                       │
│ Hour: 3rd (19:00 UTC)              │
├─────────────────────────────────────┤
│ Ready for M15 entry scan →         │
└─────────────────────────────────────┘
```

---

## PHASE 4: TECHNICAL ENGINE — M15 ENTRY (Week 5-6)

### Goal: Generate final entry signals with PO3, MSS, FVG

### Backend: M15 Entry Engine

```sql
CREATE TABLE entry_signals (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(5),                    -- 'long' | 'short'
    entry_price DECIMAL(12,5),
    stop_loss DECIMAL(12,5),
    take_profit DECIMAL(12,5),
    rr_ratio DECIMAL(5,2),
    po3_phase VARCHAR(20),                   -- 'accumulation' | 'manipulation' | 'distribution'
    mss_level DECIMAL(12,5),
    mss_type VARCHAR(20),
    fvg_stage INTEGER,                       -- 1 or 2
    fvg_top DECIMAL(12,5),
    fvg_bottom DECIMAL(12,5),
    confluence JSONB,                         -- array of confluence factors
    confidence INTEGER,
    result VARCHAR(10) DEFAULT 'open',        -- 'open' | 'tp' | 'sl' | 'breakeven'
    weekly_profile_id INTEGER,
    h4_signal_id INTEGER,
    h1_confirmation_id INTEGER,
    fundamental_bias VARCHAR(10),
    fundamental_weight DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);
```

**PO3 Detection:**
```
1. Accumulation: Sideways range (ATR compression)
2. Manipulation: Sweep of range high/low (liquidity grab)
3. Distribution: Impulse move in true direction
```

**MSS Detection:**
```
Bullish MSS: Price breaks above previous lower high + displacement candle
Bearish MSS: Price breaks below previous higher low + displacement candle
```

**FVG Stage:**
```
Stage 1: First FVG after MSS → DON'T ENTER (often retested)
Stage 2: Second FVG after MSS → ENTRY ZONE (higher probability)
```

**Entry Rules (merged with fundamental):**
```
1. H1 confirmed (Phase 3)
2. PO3 in distribution phase
3. MSS formed with displacement
4. FVG Stage 2 available
5. 2R minimum (reward >= 2x risk)
6. Not within 30min of high-impact event
7. Day is tradable (not Monday, not NFP Friday)
8. Fundamental bias aligns with technical direction
```

**API Endpoint:**
```
GET /api/entry/:symbol
Response: {
  ready: boolean,
  signal: EntrySignal | null,
  po3Phase: string,
  mssFormed: boolean,
  fvgStage2Available: boolean,
  fundamentalAlignment: boolean,
  eventProximity: boolean
}
```

### Frontend: M15 Entry Card

```
┌─────────────────────────────────────┐
│ M15 ENTRY: XAUUSD                  │
│ Status: 🟢 READY                    │
│ Direction: LONG                     │
├─────────────────────────────────────┤
│ PO3: Distribution phase             │
│ MSS: ✅ Bullish @ 3245.00          │
│ FVG Stage 2: 3240-3248             │
├─────────────────────────────────────┤
│ Entry: 3245.00                      │
│ SL:    3220.00 (25.00)             │
│ TP:    3295.00 (50.00)             │
│ R:R:   2.0:1 ✅                    │
├─────────────────────────────────────┤
│ Fundamental: ✅ Aligned (Bullish)   │
│ Week Type: MEDIUM (post-CPI drift)  │
│ Event: No event in 2h              │
└─────────────────────────────────────┘
```

---

## PHASE 5: FUNDAMENTAL ENGINE (Week 3-4, parallel with Phase 2-3)

### Goal: Real-time fundamental context per symbol

### Backend: Fundamental Engine

**Location:** VPS service, runs continuously (every 15 min + on event)

```sql
-- Week type classification (computed weekly)
CREATE TABLE week_classifications (
    id SERIAL PRIMARY KEY,
    week_start DATE NOT NULL,
    week_type VARCHAR(20),                   -- 'HIGH_IMPACT' | 'MEDIUM_IMPACT' | 'LOW_IMPACT' | 'LOW_MEDIUM_IMPACT'
    volatility_multiplier DECIMAL(3,2),
    max_positions INTEGER,
    stop_loss_widen DECIMAL(3,2),
    entry_rule VARCHAR(30),
    best_strategy VARCHAR(30),
    tier_counts JSONB,                       -- {"S+": 0, "S": 1, "A": 2, "B": 1, "C": 0, "D": 0}
    upcoming_events JSONB,                   -- [{ name, date, time, tier, symbols }]
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(week_start)
);

-- Fundamental bias per symbol (computed daily + on event)
CREATE TABLE fundamental_bias (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    bias_date DATE NOT NULL,
    bias VARCHAR(10),                        -- 'bullish' | 'bearish' | 'neutral'
    score DECIMAL(4,2),
    day_type VARCHAR(20),                    -- 'manipulation' | 'continuation' | 'reversal' | 'expansion' | 'distribution'
    day_fundamental_weight DECIMAL(3,2),
    upcoming_events JSONB,
    event_proximity BOOLEAN DEFAULT FALSE,
    last_surprise DECIMAL(6,4),
    last_surprise_direction VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, bias_date)
);
```

**Engine Logic (runs every 15 min during trading hours):**
```
1. Check current week classification
2. Check upcoming events (next 48h)
3. Check if within 30min of event → event_proximity = true
4. Get last release for this symbol → surprise direction
5. Get day profile (Mon=tue=... based on day of week)
6. Calculate bias score:
   - base = day_fundamental_weight
   - *= week_type.volatility_multiplier
   - += surprise momentum (±0.3)
   - direction: score > 0.3 = bullish, < -0.3 = bearish, else neutral
7. Store in fundamental_bias table
```

**API Endpoint:**
```
GET /api/fundamental-context/:symbol
Response: {
  symbol: string,
  bias: 'bullish' | 'bearish' | 'neutral',
  score: number,
  dayType: string,
  weekType: string,
  volatilityMultiplier: number,
  eventProximity: boolean,
  nextEvent: { name, date, time, tier },
  lastSurprise: { event, date, surprise_pct },
  positionSizing: string,
  stopAdjustment: number,
  timestamp: number
}
```

**Event-Driven Trigger (webhook from economic calendar):**
```
POST /api/event-release
Body: { event_id, actual, consensus, previous, revision_prev }
Logic:
  1. Calculate surprise: (actual - consensus) / consensus
  2. Calculate total_surprise: surprise + revision effect
  3. Store in event_releases
  4. Update fundamental_bias for all affected symbols
  5. Trigger SMT re-check (correlation may shift)
  6. Broadcast to WebSocket (frontend live update)
```

### Frontend: Fundamental Context Panel

```
┌─────────────────────────────────────┐
│ FUNDAMENTAL: XAUUSD                │
│ Bias: Bullish (score: 0.45)        │
│ Day: Reversal (Wed) — Weight: 1.2x │
│ Week: MEDIUM (CPI week)            │
├─────────────────────────────────────┤
│ Next Event: CPI @ 08:30 UTC (4h)  │
│ ⚠️ Do NOT enter 30min before       │
├─────────────────────────────────────┤
│ Last: NFP (1 Jul) — Surprise: -0.3 │
│ Direction: USD bearish → Gold bid    │
├─────────────────────────────────────┤
│ Correlations:                       │
│ EURUSD: +0.50 (aligned)            │
│ USDJPY: -0.40 (aligned)            │
│ BTCUSD: +0.28 (weak alignment)     │
└─────────────────────────────────────┘
```

---

## PHASE 6: SMT + CROSS-ASSET CORRELATION (Week 6-7)

### Goal: Multi-pair divergence detection + correlation tracking

### Backend: SMT Engine

```sql
CREATE TABLE smt_signals (
    id SERIAL PRIMARY KEY,
    pair1 VARCHAR(20) NOT NULL,
    pair2 VARCHAR(20) NOT NULL,
    smt_type VARCHAR(20),                    -- 'bullish_smt' | 'bearish_smt'
    pair1_action VARCHAR(30),                -- 'swept_high' | 'swept_low' | 'held_high' | 'held_low'
    pair2_action VARCHAR(30),
    description TEXT,
    confidence INTEGER,
    resolved BOOLEAN DEFAULT FALSE,
    result VARCHAR(20),                      -- 'tp' | 'sl' | 'expired'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE correlation_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_time TIMESTAMP NOT NULL,
    pair1 VARCHAR(20) NOT NULL,
    pair2 VARCHAR(20) NOT NULL,
    correlation DECIMAL(4,3),
    regime VARCHAR(20),                      -- 'normal' | 'stress' | 'breaking'
    lookback_hours INTEGER DEFAULT 24,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**SMT Detection Rules:**
```
XAUUSD vs USDJPY (inverse correlation):
  - XAU sweeps high + USDJPY fails to sweep low → Bullish SMT
  - XAU fails to sweep high + USDJPY sweeps low → Bearish SMT

EURUSD vs GBPUSD (positive correlation):
  - EURUSD sweeps high + GBPUSD fails → Bearish SMT (divergence)
  - EURUSD fails + GBPUSD sweeps high → Bullish SMT (divergence)
```

**Correlation Regime Detection:**
```
Normal: |corr| > 0.6 (stable)
Stress: |corr| < 0.3 (breaking)
Breaking: corr sign flip (regime change)
→ On "breaking": pause signals, wait for regime reset
```

**API Endpoint:**
```
GET /api/smt/:symbol
Response: {
  symbol: string,
  smtSignal: SMTSignal | null,
  correlations: [{ pair, correlation, regime }],
  regimeAlert: boolean,
  timestamp: number
}
```

---

## PHASE 7: UNIFIED SIGNAL GENERATOR (Week 7-8)

### Goal: Merge all layers into final signal with confidence scoring

### Backend: Confluence Engine

```sql
-- Unified signal output
CREATE TABLE unified_signals (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(5),                    -- 'long' | 'short'
    entry_price DECIMAL(12,5),
    stop_loss DECIMAL(12,5),
    take_profit DECIMAL(12,5),
    rr_ratio DECIMAL(5,2),

    -- Layer scores (0-100 each)
    layer1_weekly_profile_score INTEGER,
    layer2_h4_signal_score INTEGER,
    layer3_h1_confirm_score INTEGER,
    layer4_m15_entry_score INTEGER,
    fundamental_score INTEGER,
    smt_score INTEGER,

    -- Confluence
    total_confidence INTEGER,                -- weighted average
    confluence_factors JSONB,                -- ["weekly_bullish", "h4_model1", "h1_ohol", "m15_fvg2", "fund_aligned", "smt_bullish"]

    -- Fundamental context
    week_type VARCHAR(20),
    event_proximity BOOLEAN,
    fundamental_bias VARCHAR(10),

    -- Risk management
    max_positions INTEGER,
    stop_adjustment DECIMAL(3,2),
    is_news_trade BOOLEAN,

    -- Status
    status VARCHAR(10) DEFAULT 'active',     -- 'active' | 'expired' | 'tp' | 'sl' | 'breakeven'
    result VARCHAR(10),
    pnl_pips DECIMAL(10,2),
    pnl_r DECIMAL(5,2),

    created_at TIMESTAMP DEFAULT NOW(),
    activated_at TIMESTAMP,
    closed_at TIMESTAMP
);
```

**Confidence Scoring Algorithm:**
```
total_confidence = 
  (layer1 * 0.25) +     // Weekly Profile: 25%
  (layer2 * 0.20) +     // H4 Signal: 20%
  (layer3 * 0.15) +     // H1 Confirmation: 15%
  (layer4 * 0.20) +     // M15 Entry: 20%
  (fundamental * 0.10) + // Fundamental: 10%
  (smt * 0.10)           // SMT: 10%

Minimum threshold: 65% to generate signal
Strong signal: >= 80%
```

**Signal Generation Flow:**
```
1. Weekly Profile exists? → No = STOP
2. H4 signal detected? → No = STOP
3. H1 confirmed? → No = STOP
4. M15 entry ready? → No = STOP
5. Event proximity check → Yes = PAUSE (wait 30min)
6. Fundamental bias alignment? → No = reduce confidence 20%
7. SMT confluence? → Yes = boost confidence 10%
8. 2R validation → No = REJECT
9. Day filter (Mon? NFP Fri?) → Yes = REJECT
10. Calculate total confidence → if >= 65% = GENERATE SIGNAL
```

**API Endpoint:**
```
GET /api/unified-signal/:symbol
Response: {
  symbol: string,
  active: boolean,
  signal: UnifiedSignal | null,
  breakdown: {
    weeklyProfile: { score, bias, model },
    h4Signal: { score, model, killzone },
    h1Confirm: { score, confirmed, ohol },
    m15Entry: { score, po3, mss, fvg },
    fundamental: { score, bias, weekType, eventProximity },
    smt: { score, signal, correlations }
  },
  timestamp: number
}
```

### Frontend: Unified Signal Display

```
┌─────────────────────────────────────────────────────┐
│ 🟢 AEGIS SIGNAL: XAUUSD — LONG                    │
│ Confidence: 82% ████████████░░░░                    │
├─────────────────────────────────────────────────────┤
│ Entry: 3245.00 | SL: 3220.00 | TP: 3295.00        │
│ R:R: 2.0:1 ✅ | Risk: 25.00 | Reward: 50.00       │
├─────────────────────────────────────────────────────┤
│ Layer Breakdown:                                     │
│ ├─ Weekly Profile: 90% (Bullish, Midweek Reversal) │
│ ├─ H4 Signal:     85% (Model 1, London Open)       │
│ ├─ H1 Confirm:    80% (OL formed, Type 3)          │
│ ├─ M15 Entry:     85% (PO3 dist, MSS, FVG2)       │
│ ├─ Fundamental:   75% (MEDIUM week, post-CPI)      │
│ └─ SMT:           70% (Bullish XAU/JPY diverge)    │
├─────────────────────────────────────────────────────┤
│ Context:                                             │
│ Week Type: MEDIUM (CPI week, vol 1.3x)             │
│ Next Event: FOMC in 3 days — widen SL 1.2x         │
│ Day: Wednesday (reversal day, high weight)          │
│ Event Proximity: Clear ✅                           │
└─────────────────────────────────────────────────────┘
```

---

## PHASE 8: FRONTEND PAGES (Week 5-8, parallel)

### Page Structure

```
frontend/src/
├── pages/
│   ├── Signals.tsx          — Main signal page (unified view)
│   ├── Calendar.tsx         — Economic calendar page
│   ├── Dashboard.tsx        — Multi-symbol overview
│   └── Settings.tsx         — Symbol config, alert preferences
├── modules/
│   ├── signals/
│   │   ├── UnifiedSignalCard.tsx    — Main signal display
│   │   ├── WeeklyProfileCard.tsx    — Layer 1 card
│   │   ├── H4SignalCard.tsx         — Layer 2 card
│   │   ├── H1ConfirmCard.tsx        — Layer 3 card
│   │   ├── M15EntryCard.tsx         — Layer 4 card
│   │   ├── FundamentalPanel.tsx     — Fundamental context
│   │   ├── SMTCard.tsx              — Cross-pair divergence
│   │   └── ConfidenceBar.tsx        — Confidence scoring display
│   ├── calendar/
│   │   ├── WeekTypeBadge.tsx        — HIGH/MEDIUM/LOW impact indicator
│   │   ├── EventTimeline.tsx        — Events for the week
│   │   └── EventHistory.tsx         — Past releases + surprise tracking
│   └── dashboard/
│       ├── SymbolOverview.tsx       — Multi-symbol bias summary
│       └── AlertFeed.tsx            — Real-time signal alerts
```

### Signals Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  AEGIS TERMINAL — SIGNALS                    [XAUUSD ▼]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────┐  ┌────────────────────────────┐  │
│  │  WEEKLY PROFILE    │  │  FUNDAMENTAL CONTEXT       │  │
│  │  Bias: Bullish     │  │  Bias: Bullish (0.45)      │  │
│  │  Model: Midweek    │  │  Week: MEDIUM              │  │
│  │  Conf: 82%         │  │  Next: CPI in 4h           │  │
│  │  Days: Tue★4 Wed★5 │  │  Day: Reversal (1.2x)      │  │
│  └────────────────────┘  └────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  UNIFIED SIGNAL                                      │  │
│  │  🟢 LONG @ 3245.00 | SL 3220 | TP 3295 | R:R 2.0  │  │
│  │  Confidence: 82% ████████████░░░░                    │  │
│  │                                                      │  │
│  │  Layers: WP 90% | H4 85% | H1 80% | M15 85%       │  │
│  │  Fund: 75% | SMT: 70%                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────────────┐  │
│  │  SIGNAL HISTORY    │  │  SMT DIVERGENCE            │  │
│  │  7 signals this wk │  │  XAU vs JPY: Bullish SMT  │  │
│  │  Win rate: 71%     │  │  EUR vs GBP: Aligned       │  │
│  └────────────────────┘  └────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Calendar Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  AEGIS TERMINAL — CALENDAR                    [Week 28]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Week Type: MEDIUM IMPACT (CPI + Jobless Claims)        │
│  Volatility: 1.3x | Max Positions: 3 | Strategy: Trend │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  MON       TUE       WED       THU       FRI    │    │
│  │  ─────     ─────     ─────     ─────     ─────  │    │
│  │  ISM Mfg   CPI 🔴   ADP       Claims    UMich   │    │
│  │  ★★☆☆☆    ★★★★★   ★★★☆☆    ★★★★☆    ★★☆☆☆   │    │
│  │  Manip     Data      Reversal  Expand    Distrib │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  UPCOMING EVENTS:                                        │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Wed 10 Jul, 08:30 UTC — CPI (Tier A)           │    │
│  │  Consensus: 3.1% | Previous: 3.0%               │    │
│  │  Expected move: XAUUSD ±$15-30, EURUSD ±40-80   │    │
│  │  Chain: Inflation → Core PCE → FOMC             │    │
│  ├──────────────────────────────────────────────────┤    │
│  │  Thu 11 Jul, 08:30 UTC — Jobless Claims (Tier B)│    │
│  │  Consensus: 225K | Previous: 229K               │    │
│  │  Chain: Employment → NFP → Fed Policy           │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  PAST RELEASES:                                         │
│  ┌──────────────────────────────────────────────────┐    │
│  │  NFP (1 Jul): Actual 175K vs 185K consensus      │    │
│  │  Surprise: -5.4% → USD bearish → Gold bullish    │    │
│  │  XAUUSD moved: +$28 (30min), +$15 (next day)    │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## PHASE 9: REAL-TIME UPDATES (Week 7-8)

### WebSocket Architecture

```
VPS PostgreSQL
    ↓ (event-driven)
CF Workers API
    ↓ (WebSocket broadcast)
Frontend (React Query + WS)
```

**WebSocket Events:**
```
signal:generated    → New unified signal available
signal:expired      → Signal no longer valid
signal:result       → TP/SL/breakeven hit
event:released      → Economic data released
event:surprise      → Significant surprise detected
correlation:shift   → Regime change detected
smt:detected        → New SMT divergence found
```

**Implementation:**
```typescript
// Frontend WebSocket connection
const ws = new WebSocket('wss://api.aegisterminal.app/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'signal:generated':
      queryClient.invalidateQueries(['unified-signal', data.symbol]);
      break;
    case 'event:released':
      queryClient.invalidateQueries(['fundamental-context', data.symbol]);
      queryClient.invalidateQueries(['economic-calendar']);
      break;
    case 'smt:detected':
      queryClient.invalidateQueries(['smt', data.symbol]);
      break;
  }
};
```

---

## DATABASE SCHEMA SUMMARY

### PostgreSQL Tables (aegis_terminal)

```
TECHNICAL TABLES:
├── historical_ohlc          — MT5 candle data (M15/H1/H4/D1/W1)
├── weekly_profiles          — Layer 1 output
├── h4_signals               — Layer 2 output
├── h1_confirmations         — Layer 3 output
└── entry_signals            — Layer 4 output

FUNDAMENTAL TABLES:
├── economic_events          — Event definitions (seed)
├── event_releases           — Actual releases + surprise
├── week_classifications     — Week type (HIGH/MEDIUM/LOW)
└── fundamental_bias         — Per-symbol daily bias

OUTPUT TABLES:
├── unified_signals          — Final merged signals
├── smt_signals              — Cross-pair divergence
├── correlation_snapshots    — Correlation regime tracking
└── signal_results           — Performance tracking
```

### D1 Tables (CF Workers — operational, unchanged)

```
├── signals                  — Current active signals
├── signal_history           — Historical signals + results
├── sessions                 — User sessions
└── trades                   — Trade management
```

---

## CRON JOBS

```
EVERY 5 MINUTES:
├── M15 candle fetch (MT5 → PostgreSQL)
└── Fundamental bias recalc (if event released)

EVERY 15 MINUTES:
├── H4 signal scan (if in killzone)
├── H1 confirmation check
├── M15 entry detection
├── SMT scan (XAU/JPY, EUR/GBP)
└── Correlation regime check

EVERY HOUR:
├── H4 candle fetch
├── Weekly profile update (if new week)
└── Week classification update

DAILY (22:00 UTC):
├── D1/W1 candle fetch
├── Next week event fetch
├── Performance report generation
└── Signal cleanup (expire old signals)

EVENT-DRIVEN:
├── Economic calendar webhook → update fundamental_bias
├── Signal generation → WebSocket broadcast
└── TP/SL hit → update signal_results
```

---

## API ENDPOINTS SUMMARY

```
DATA:
POST /api/candles/:symbol/:timeframe          — Ingest candle data
POST /api/event-release                        — Economic data webhook

TECHNICAL:
GET  /api/weekly-profile/:symbol               — Layer 1
GET  /api/h4-profile/:symbol                   — Layer 2
GET  /api/h1-confirm/:symbol?h4SignalId=:id    — Layer 3
GET  /api/entry/:symbol                        — Layer 4

FUNDAMENTAL:
GET  /api/fundamental-context/:symbol          — Fundamental bias
GET  /api/economic-calendar/:week              — Week events + type
GET  /api/event-history/:symbol?limit=20       — Past releases

CONFLUENCE:
GET  /api/unified-signal/:symbol               — Merged signal
GET  /api/smt/:symbol                          — SMT divergence
GET  /api/correlations/:symbol                 — Correlation matrix

HISTORY:
GET  /api/signals/history/:symbol              — Signal history
GET  /api/signals/history/:symbol/stats        — Win rate, R:R, etc.
POST /api/signals/history/:id/result           — Manual override

SYSTEM:
GET  /api/health                               — Health check
GET  /api/week-type                            — Current week classification
```

---

## IMPLEMENTATION PRIORITY

### Must Have (MVP)
1. ✅ PostgreSQL setup (DONE)
2. ⬜ MT5 candle ingestion → historical_ohlc
3. ⬜ Weekly profile engine + API
4. ⬜ H4 profiling engine + API
5. ⬜ H1 confirmation engine + API
6. ⬜ M15 entry engine + API
7. ⬜ Unified signal generator
8. ⬜ Frontend: Signals page (all 4 layers + fundamental)
9. ⬜ Economic calendar seed data

### Should Have (v1.1)
10. ⬜ Economic calendar auto-fetch
11. ⬜ Event-driven fundamental bias recalc
12. ⬜ SMT detection engine
13. ⬜ Correlation regime tracking
14. ⬜ Frontend: Calendar page
15. ⬜ WebSocket real-time updates
16. ⬜ Performance analytics

### Nice to Have (v2.0)
17. ⬜ AI/ML event prediction (surprise scoring)
18. ⬜ Backtesting engine
19. ⬜ Multi-strategy support
20. ⬜ Alert system (Telegram/WhatsApp)
21. ⬜ Portfolio-level risk management
22. ⬜ Seasonal pattern automation

---

## ESTIMATED TIMELINE

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| Phase 0: Data Foundation | Week 1-2 | PostgreSQL ✅, MT5 API |
| Phase 1: Weekly Profile | Week 2-3 | Phase 0 |
| Phase 2: H4 Profiling | Week 3-4 | Phase 0, Phase 1 |
| Phase 3: H1 Confirmation | Week 4-5 | Phase 2 |
| Phase 4: M15 Entry | Week 5-6 | Phase 3 |
| Phase 5: Fundamental | Week 3-4 | Phase 0 (parallel) |
| Phase 6: SMT + Correlation | Week 6-7 | Phase 1-4 |
| Phase 7: Unified Signal | Week 7-8 | Phase 1-6 |
| Phase 8: Frontend | Week 5-8 | Phase 1-7 |
| Phase 9: Real-time | Week 7-8 | Phase 7 |

**Total: ~8 weeks to full implementation**
**MVP (Phases 0-4): ~6 weeks**

---

*This plan merges FRAMEWORK_SPEC.md (technical ICT 4-layer) and FUNDAMENTAL_SPEC.md (economic calendar integration) into a single implementation roadmap with clear backend, frontend, database, and API specifications.*
