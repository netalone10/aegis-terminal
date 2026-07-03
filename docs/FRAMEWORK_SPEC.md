# Aegis Terminal — JCTraderss Framework Integration Spec

## Overview

Rebuild Aegis signal system berdasarkan JCTraderss framework: 4-layer top-down analysis
dengan OHLC sequence logic, profiling models, dan PO3 orderflow.

---

## Layer Architecture

```
┌─────────────────────────────────────┐
│  LAYER 1: WEEKLY PROFILE            │
│  "What story is the market telling?"│
│  Bias, Narrative, Day Ranking       │
├─────────────────────────────────────┤
│  LAYER 2: H4 PROFILING TIME         │
│  "When to look"                     │
│  Killzone, Model Selection, Timing  │
├─────────────────────────────────────┤
│  LAYER 3: H1 KONFIRMASI             │
│  "Validate the setup"               │
│  OH/OL Structure, Model Matching    │
├─────────────────────────────────────┤
│  LAYER 4: M15 ENTRY                 │
│  "Execute"                          │
│  PO3, MSS, FVG Stage 2, Entry       │
└─────────────────────────────────────┘
```

---

## LAYER 1: WEEKLY PROFILE

### Purpose
Menentukan bias/narrative untuk entire week. Filter hari high-probability.

### Data Required
- Weekly OHLC candle (current + previous)
- Economic calendar (news events)
- D1 candles (5 per week)

### Logic

#### 1A. Weekly Candle Projection
Identify which model the current week follows:

```typescript
type WeeklyModel = 'classic_expansion' | 'consolidation_reversal' | 'midweek_reversal';

interface WeeklyProjection {
  model: WeeklyModel;
  monday: 'open';
  tuesday: 'low_or_high' | 'accumulation';
  wednesday: 'distribution' | 'accumulation' | 'low_or_high';
  thursday: 'continue' | 'low_or_high' | 'distribution';
  friday: 'close' | 'distribution_close' | 'continue_close';
}
```

**Detection Logic:**
- Classic Expansion: Monday Open, Tuesday makes weekly extreme (H/L), Wed-Thu expand
- Consolidation Reversal: Mon-Wed sideways, Thursday makes extreme, Friday reverses
- Midweek Reversal: Mon-Tue sideways, Wednesday makes extreme, Thu-Fri reverse

#### 1B. Day Ranking
Score each day 1-5 based on:
- News events (high impact = higher score)
- Weekly model position
- Historical day-of-week performance

```typescript
interface DayRanking {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
  score: number; // 1-5
  highProbability: boolean; // score >= 4
  reason: string;
}
```

**Rules:**
- Monday: Always low score (Monday Rules)
- Tuesday-Thursday: High probability (news + model alignment)
- Friday: Low unless post-NFP week

#### 1C. OHLC Sequence Detection
From weekly candle shape, determine sequence:

```typescript
type CandleSequence = 'OLHC' | 'OHLC';

function detectSequence(open: number, high: number, low: number, close: number): CandleSequence {
  // Bullish: OLHC (Open near Low, Close near High)
  // Bearish: OHLC (Open near High, Close near Low)
  if (close > open) return 'OLHC'; // bullish
  return 'OHLC'; // bearish
}
```

### D1 Decomposition
Weekly candle decomposed into 5 D1 candles. Each D1 candle has:
- OHLC sequence (bullish = OLHC, bearish = OHLC)
- Profiling model (1, 2, or 3)
- Swing point context

### API Endpoint
```
GET /api/weekly-profile/:symbol
Response: {
  model: WeeklyModel;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  dayRanking: DayRanking[];
  sequence: CandleSequence;
  previousWeek: { open, high, low, close };
  currentWeek: { open, high, low, close };
  timestamp: number;
}
```

---

## LAYER 2: H4 PROFILING TIME

### Purpose
Identify which H4 candle to trade based on killzone timing.

### Data Required
- H4 candles (current day, last 3-5)
- Current time (WIB)
- Session schedule

### Killzone Mapping

```typescript
interface Killzone {
  name: string;
  h4Time: string;      // "13:00" | "17:00" | "21:00"
  wibTime: string;     // WIB equivalent
  session: string;     // "London Open" | "London Lunch" | "New York"
  priority: number;    // 1-3 (1 = best)
}

const KILLZONES: Killzone[] = [
  { name: 'London Open', h4Time: '13:00', wibTime: '13:00', session: 'London', priority: 1 },
  { name: 'London Lunch', h4Time: '17:00', wibTime: '17:00', session: 'London', priority: 2 },
  { name: 'New York', h4Time: '21:00', wibTime: '21:00', session: 'New York', priority: 1 },
];
```

### H4 Model Detection

Each H4 candle in killzone gets scored against 4 models:

```typescript
type H4Model = 1 | 2 | 3 | 4;

interface H4Signal {
  model: H4Model;
  trigger: 'candle_5_reversal' | 'candle_9_continue' | 'candle_9_reversal' | 'candle_1_reversal';
  killzone: Killzone;
  h1Time: string;      // "19:00/20:00" | "22:00/23:00" | "15:00/16:00"
  bias: 'bullish' | 'bearish';
  confidence: number;
  keyLevel: number;    // red dot level
}
```

**Model Detection Logic:**

Model 1 (Candle 5 Reversal):
- Candles 1-4 form structure
- Candle 5 sweeps and reverses
- Red dot = sweep level

Model 2 (Candle 9 Continue):
- Candles 1-8 form structure
- Candle 9 continues trend
- No sweep, just continuation

Model 3 (Candle 9 Reversal):
- Candles 1-8 form structure
- Candle 9 sweeps and reverses
- Red dot = sweep level

Model 4 (Candle 1 Reversal):
- Candle 1 is the reversal candle
- Candles 2-4 confirm
- Red dot = reversal level

### Profiling Time Rule
Per H4 candle:
- Hour 1 (Open-13:00): Pantau (Monitor)
- Hour 2 (13:00-17:00): Validasi (Validate)
- Hour 3 (17:00-21:00): Validasi (Validate)
- Hour 4 (21:00-01:00): Pantau (Monitor)

### API Endpoint
```
GET /api/h4-profile/:symbol
Response: {
  activeKillzone: Killzone;
  signals: H4Signal[];
  profilingPhase: 'monitor' | 'validate';
  timestamp: number;
}
```

---

## LAYER 3: H1 KONFIRMASI

### Purpose
Validate H4 signal using H1 candle structure.

### Data Required
- H1 candles (current H4 candle = 4 H1 candles)
- H4 signal from Layer 2

### OH/OL Validation

```typescript
interface H1Confirmation {
  model: H4Model;
  confirmationType: 'reversal' | 'continue';
  h1Candles: Candle[];  // 4 candles
  oholFormed: boolean;  // OH/OL structure formed
  validationHour: number; // which hour validated
  confidence: number;
}
```

**Logic:**
1. Take 4 H1 candles from current H4 candle
2. Check if 2 consecutive H1 closings form OH/OL:
   - OH (Open-High): Close of candle 1 > Close of candle 2 → bearish
   - OL (Open-Low): Close of candle 1 < Close of candle 2 → bullish
3. If OH/OL formed → next candle validates direction
4. Match against 4 confirmation models

### Confirmation Models (4 types)
Each model has specific H1 candle arrangement:
- Model 1: Bearish H4, H1 shows rejection pattern
- Model 2: Bullish H4, H1 shows continuation pattern
- Model 3: Bullish H4, H1 shows reversal pattern
- Model 4: Bearish H4, H1 shows continuation pattern

### API Endpoint
```
GET /api/h1-confirm/:symbol?h4Model=1
Response: {
  confirmed: boolean;
  confirmationType: 'reversal' | 'continue';
  model: number;
  h1Candles: Candle[];
  oholStructure: string;
  confidence: number;
}
```

---

## LAYER 4: M15 ENTRY

### Purpose
Precise entry execution using PO3 pattern.

### Data Required
- M15 candles (last 20-30)
- H1 confirmation from Layer 3

### PO3 Detection (Power of 3)

```typescript
type PO3Phase = 'accumulation' | 'manipulation' | 'distribution';

interface PO3Pattern {
  phase: PO3Phase;
  direction: 'bullish' | 'bearish';
  accumulationRange: { high: number; low: number };
  manipulationSweep: { level: number; type: 'high' | 'low' };
  distributionStart: number;
}
```

**Detection Logic:**
1. Accumulation: Sideways range (ATR compression)
2. Manipulation: Sweep of range high/low (liquidity grab)
3. Distribution: Impulse move in true direction

### MSS (Market Structure Shift)

```typescript
interface MSS {
  type: 'bullish_mss' | 'bearish_mss';
  level: number;
  displacement: boolean; // strong move after MSS
  timestamp: number;
}
```

**Detection:**
- Bullish MSS: Price breaks above previous lower high
- Bearish MSS: Price breaks below previous higher low
- Displacement: Large body candle after MSS (momentum confirmation)

### FVG Stage Detection

```typescript
interface FVGStage {
  stage: 1 | 2;
  type: 'bull' | 'bear';
  top: number;
  bottom: number;
  filled: boolean;
}
```

**Entry Rule:**
- FVG Stage 1: First FVG after MSS (DON'T ENTRY — often retested)
- FVG Stage 2: Second FVG after MSS (ENTRY ZONE — higher probability)

### Entry Signal

```typescript
interface EntrySignal {
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  po3: PO3Pattern;
  mss: MSS;
  fvgStage: FVGStage;
  confluence: string[];  // SMT, profiling match, etc.
  confidence: number;
  layer1: WeeklyProfile;
  layer2: H4Signal;
  layer3: H1Confirmation;
  timestamp: number;
}
```

### API Endpoint
```
GET /api/entry/:symbol
Response: {
  ready: boolean;
  signal: EntrySignal | null;
  po3Phase: PO3Phase;
  mssFormed: boolean;
  fvgStage2Available: boolean;
}
```

---

## CONFLUENCE: SMT (Smart Money Technique)

### Logic

```typescript
interface SMTSignal {
  pair1: string;
  pair2: string;
  type: 'bullish_smt' | 'bearish_smt';
  description: string;
  confidence: number;
}
```

**Detection:**
- XAUUSD vs USDJPY (inverse correlation)
- EURUSD vs GBPUSD (positive correlation)
- Check if both sweep same level or one fails

```typescript
function detectSMT(pair1Data: Candle[], pair2Data: Candle[]): SMTSignal | null {
  const p1SweptHigh = pair1Data[pair1Data.length-1].high > pair1Data[pair1Data.length-2].high;
  const p2SweptHigh = pair2Data[pair2Data.length-1].high > pair2Data[pair2Data.length-2].high;
  
  if (p1SweptHigh && !p2SweptHigh) {
    return { type: 'bearish_smt', pair1: 'XAUUSD', pair2: 'USDJPY', ... };
  }
  if (!p1SweptHigh && p2SweptHigh) {
    return { type: 'bullish_smt', ... };
  }
  return null;
}
```

---

## RISK MANAGEMENT

### 2R Minimum Rule

```typescript
function validateRR(entry: number, sl: number, tp: number): boolean {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  return reward >= risk * 2; // minimum 2R
}
```

### Day Filter

```typescript
function isTradableDay(day: string, isNFPWeek: boolean): boolean {
  if (day === 'monday') return false;
  if (day === 'friday' && isNFPWeek) return false;
  return true;
}
```

---

## DATABASE SCHEMA

### New Tables

```sql
-- Weekly profiles (computed once per week)
CREATE TABLE weekly_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  week_start TEXT NOT NULL,
  model TEXT, -- 'classic_expansion' | 'consolidation_reversal' | 'midweek_reversal'
  bias TEXT,
  sequence TEXT, -- 'OLHC' | 'OHLC'
  day_rankings TEXT, -- JSON
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- H4 signals (per killzone)
CREATE TABLE h4_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  model INTEGER, -- 1-4
  trigger_type TEXT,
  killzone TEXT,
  h1_time TEXT,
  bias TEXT,
  key_level REAL,
  confidence INTEGER,
  confirmed BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Entry signals (final output)
CREATE TABLE entry_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  direction TEXT,
  entry REAL,
  sl REAL,
  tp REAL,
  rr REAL,
  po3_phase TEXT,
  mss_level REAL,
  fvg_stage INTEGER,
  confluence TEXT, -- JSON array
  confidence INTEGER,
  result TEXT DEFAULT 'open',
  weekly_profile_id INTEGER,
  h4_signal_id INTEGER,
  h1_confirmation_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);
```

---

## FRONTEND ARCHITECTURE

### Signal Display (per symbol)

```
┌─────────────────────────────────────┐
│  WEEKLY BIAS: Bullish (OLHC)        │
│  Model: Midweek Reversal            │
│  High Prob Days: Tue, Wed, Thu      │
├─────────────────────────────────────┤
│  H4 SIGNAL: Model 1 (Reversal)      │
│  Killzone: London Open (13:00)      │
│  H1 Time: 19:00/20:00 WIB          │
│  Phase: Monitoring...               │
├─────────────────────────────────────┤
│  H1 CONFIRM: ✅ Bullish Reversal    │
│  OH/OL: Formed                      │
│  Model: Type 3                       │
├─────────────────────────────────────┤
│  M15 ENTRY: READY                   │
│  PO3: Distribution phase            │
│  MSS: ✅ Bullish shift @ 3245       │
│  FVG Stage 2: 3240-3248            │
│  Entry: 3245 | SL: 3220 | TP: 3295 │
│  R:R: 2.0:1 ✅                      │
└─────────────────────────────────────┘
```

### Components
1. `WeeklyProfileCard` — Bias, model, day rankings
2. `H4SignalCard` — Active killzone, model detection
3. `H1ConfirmCard` — OH/OL validation status
4. `M15EntryCard` — PO3 phase, MSS, FVG, entry levels
5. `SMTCard` — Cross-pair divergence alerts
6. `RiskCard` — 2R validation, position sizing

---

## IMPLEMENTATION PRIORITY

### Phase 1: Weekly Profile Engine
- [ ] Weekly OHLC detection
- [ ] Model classification (classic/consolidation/midweek)
- [ ] Day ranking system
- [ ] OHLC sequence detection
- [ ] API endpoint + frontend card

### Phase 2: H4 Profiling
- [ ] Killzone timer
- [ ] H4 model detection (1-4)
- [ ] Key level extraction (red dots)
- [ ] API endpoint + frontend card

### Phase 3: H1 Confirmation
- [ ] OH/OL structure detection
- [ ] Confirmation model matching
- [ ] API endpoint + frontend card

### Phase 4: M15 Entry
- [ ] PO3 pattern detection
- [ ] MSS detection
- [ ] FVG stage classification
- [ ] Entry signal generation
- [ ] API endpoint + frontend card

### Phase 5: Confluence
- [ ] SMT detection (XAUUSD/USDJPY, EURUSD/GBPUSD)
- [ ] Cross-pair analysis
- [ ] Combined confidence scoring

### Phase 6: Integration
- [ ] Layer chaining (1→2→3→4)
- [ ] Signal history with full layer data
- [ ] Result tracking per entry
- [ ] Performance analytics per layer
