# Crypto Signal Generator — Design Spec

**Date:** 2026-07-05
**Author:** Hermes (Akbar's technical co-founder)
**Status:** Approved
**Target:** Aegis Terminal extension

---

## 1. Overview

Build a real-time crypto signal generator that scans Bybit's top 10 coins (by 24h volume) using WebSocket data. Combines SMC/ICT analysis, technical indicators, and volume analysis into confluence-scored signals. Outputs to Telegram alerts and extends the existing Aegis Terminal dashboard.

**Key decisions:**
- Extend Aegis Terminal (shared VPS, PostgreSQL, CF Worker, CF Pages)
- Bybit WebSocket for real-time data (not REST polling)
- Top 10 coins by 24h volume (dynamic list, fetched from Bybit API every 24h)
- Multi-timeframe: H4 → H1 → M15
- Scan on candle close, near real-time
- Read-only API (signals only, no trading)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Bybit WebSocket                    │
│     wss://stream.bybit.com/v5/public/linear          │
│     (kline H4, H1, M15 + ticker real-time)          │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│            VPS Signal Engine (Node.js)               │
│  ┌─────────────────────────────────────────────┐    │
│  │  Bybit WS Client → parse kline data         │    │
│  │  Store candles → PostgreSQL                  │    │
│  │  Signal Engine → SMC + Technical + Volume    │    │
│  │  Store signals → PostgreSQL                  │    │
│  │  Telegram Alert → via Bot API                │    │
│  └─────────────────────────────────────────────┘    │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│        PostgreSQL (aegis_terminal)                   │
│  Tables: crypto_candles, crypto_signals,             │
│          crypto_screening_results                    │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│        CF Worker (existing Aegis Worker)             │
│  GET /api/crypto/signals → list signals             │
│  GET /api/crypto/screening → screening results      │
│  GET /api/crypto/live/:symbol → live price          │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│        CF Pages (existing Aegis Dashboard)           │
│  /crypto → Screener view                            │
│  /crypto/:symbol → Detail signal view               │
└─────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Bybit WebSocket koneksi di VPS (persistent), bukan CF Worker (stateless)
- Signal engine jalan di VPS, trigger setiap kline close
- CF Worker jadi API layer untuk dashboard (read from DB)
- Telegram alerts dikirim langsung dari VPS

---

## 3. Data Model

### PostgreSQL Tables

```sql
-- Candle data dari Bybit WebSocket
CREATE TABLE crypto_candles (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,  -- 'H4', 'H1', 'M15'
  open DECIMAL(18,8) NOT NULL,
  high DECIMAL(18,8) NOT NULL,
  low DECIMAL(18,8) NOT NULL,
  close DECIMAL(18,8) NOT NULL,
  volume DECIMAL(18,8) NOT NULL,
  timestamp BIGINT NOT NULL,      -- Unix timestamp (seconds)
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(symbol, timeframe, timestamp)
);

-- Generated signals
CREATE TABLE crypto_signals (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  bias VARCHAR(10) NOT NULL,      -- 'bullish', 'bearish', 'neutral'
  confidence INTEGER NOT NULL,    -- 0-100
  price DECIMAL(18,8) NOT NULL,
  
  -- SMC confluence
  structure JSONB NOT NULL,
  
  -- Technical confluence
  technical JSONB NOT NULL,
  
  -- Volume confluence
  volume JSONB NOT NULL,
  
  -- Setups
  setups JSONB NOT NULL,
  
  -- Confluence score
  confluence_score INTEGER NOT NULL,  -- 0-100
  
  -- Reasoning
  reasoning TEXT NOT NULL,
  
  -- Metadata
  status VARCHAR(10) DEFAULT 'active',  -- 'active', 'expired', 'hit'
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Screening results (audit log)
CREATE TABLE crypto_screening (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  scan_time TIMESTAMP NOT NULL,
  signal_generated BOOLEAN DEFAULT FALSE,
  signal_id INTEGER REFERENCES crypto_signals(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_crypto_candles_symbol_tf ON crypto_candles(symbol, timeframe, timestamp DESC);
CREATE INDEX idx_crypto_signals_symbol ON crypto_signals(symbol, created_at DESC);
CREATE INDEX idx_crypto_signals_status ON crypto_signals(status, created_at DESC);
CREATE INDEX idx_crypto_screening_symbol ON crypto_screening(symbol, scan_time DESC);
```

### TypeScript Interfaces

```typescript
interface CryptoCandle {
  symbol: string;
  timeframe: 'H4' | 'H1' | 'M15';
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface CryptoSignal {
  id?: number;
  symbol: string;
  timeframe: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  price: number;
  
  structure: {
    trend: string;
    bos: boolean;
    choch: boolean;
    fvgs: FVG[];
    orderBlocks: OrderBlock[];
    swings: SwingPoint[];
  };
  
  technical: {
    rsi: { value: number; zone: string; divergence?: string };
    macd: { signal: string; histogram: string };
    emaAlignment: string;
    bollinger: { position: string; squeeze: boolean };
    atr: number;
  };
  
  volume: {
    poc: number;
    vwap: number;
    obvTrend: string;
    volumeSpike: boolean;
    volumeProfile: { poc: number; vah: number; val: number };
  };
  
  setups: Setup[];
  confluenceScore: number;
  reasoning: string;
  timestamp: number;
}

interface Setup {
  type: 'long' | 'short';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  reason: string;
  confluence: string[];
  status: 'active' | 'waiting';
}

interface FVG {
  type: 'bull' | 'bear';
  top: number;
  bottom: number;
  time: number;
  gap: number;
}

interface OrderBlock {
  type: 'bull_ob' | 'bear_ob';
  high: number;
  low: number;
  time: number;
}

interface SwingPoint {
  price: number;
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'SH' | 'SL';
  time: number;
  index: number;
}
```

---

## 4. Signal Engine Design

### 4.1 Layer 1: SMC/ICT Analysis

**Input:** H4, H1, M15 candles

**Components:**
1. **Market Structure Detection**
   - Swing high/low identification (2-candle lookback)
   - HH/HL/LH/LL classification
   - Trend determination (bullish: HH+HL, bearish: LH+LL)

2. **Break of Structure (BOS)**
   - Bullish BOS: price breaks above previous swing high
   - Bearish BOS: price breaks below previous swing low
   - Validity: must close above/below (not just wick)

3. **Change of Character (CHoCH)**
   - First break against prevailing trend
   - Higher confidence reversal signal

4. **Fair Value Gaps (FVG)**
   - Bull FVG: candle[i].low > candle[i-2].high
   - Bear FVG: candle[i].high < candle[i-2].low
   - Track: top, bottom, gap size, time

5. **Order Blocks**
   - Last opposing candle before impulsive move
   - Bull OB: bearish candle before strong bullish move
   - Bear OB: bullish candle before strong bearish move
   - Validation: move > 2x candle body

6. **Premium/Discount Zones**
   - Equilibrium: (swing high + swing low) / 2
   - Premium: price > equilibrium + 10% of range
   - Discount: price < equilibrium - 10% of range

### 4.2 Layer 2: Technical Indicators

**Input:** H1 candles (primary timeframe)

**Indicators:**
1. **RSI (14)**
   - Overbought: > 70
   - Oversold: < 30
   - Divergence: price vs RSI direction mismatch

2. **MACD (12, 26, 9)**
   - Signal crossover: MACD crosses signal line
   - Histogram: momentum strength
   - Zero line cross: trend change

3. **EMA Alignment (20, 50, 200)**
   - Bullish: EMA20 > EMA50 > EMA200
   - Bearish: EMA20 < EMA50 < EMA200
   - Dynamic S/R: price bouncing off EMAs

4. **Bollinger Bands (20, 2)**
   - Squeeze: bandwidth < threshold → breakout imminent
   - Position: price relative to bands
   - Breakout: close above/below bands

5. **ATR (14)**
   - Volatility context
   - Used for SL/TP sizing

### 4.3 Layer 3: Volume Analysis

**Input:** M15 candles + volume

**Components:**
1. **Volume Profile**
   - Point of Control (POC): price with highest volume
   - Value Area High (VAH): 70% volume above POC
   - Value Area Low (VAL): 70% volume below POC

2. **VWAP**
   - Volume Weighted Average Price
   - Price above VWAP = bullish, below = bearish

3. **On-Balance Volume (OBV)**
   - Cumulative volume flow
   - Rising OBV = buying pressure
   - Falling OBV = selling pressure

4. **Volume Spike Detection**
   - Current volume > 2x average volume (20-period)
   - Signals institutional activity

### 4.4 Confluence Scoring

```
Each layer votes:
  +1 = agrees with direction
  -1 = disagrees with direction
   0 = neutral/no signal

Final score = (sum of votes / 3) * 100

Rules:
- Minimum 1 layer must agree (vote +1) to generate signal
- If 0 layers agree → skip (no signal)
- If all 3 disagree → skip (no signal)

Confidence mapping:
- 3 agree → 80-95% (strong signal)
- 2 agree → 60-80% (moderate signal)
- 1 agree → 40-60% (weak signal, marked low-confidence)
- 0 agree → skip (no signal)
```

### 4.5 Signal Output Generation

When signal is generated:

1. **Entry Calculation**
   - Long: entry at FVG top or OB high
   - Short: entry at FVG bottom or OB low
   - Use nearest confluence zone

2. **Stop Loss**
   - Below/above order block + ATR buffer
   - Minimum 0.5% from entry

3. **Take Profit**
   - Previous swing high/low
   - Next resistance/support
   - Minimum R:R 1.5

4. **Reasoning Generation**
   - Combine all layer outputs
   - Natural language summary
   - Highlight key confluence factors

---

## 5. Screening Logic

**Scan cycle:** Every 5-15 minutes (configurable)

**Process:**
1. Bybit WebSocket receives kline updates
2. On kline close (H4/H1/M15):
   - Store candle in PostgreSQL
   - Run signal engine for that symbol + timeframe
3. If signal generated:
   - Store in crypto_signals
   - Send Telegram alert (if confidence ≥ 60%)
   - Log in crypto_screening

**Smart caching:**
- Only run engine on kline close (last tick of period)
- Cache indicator calculations (RSI, MACD, etc.)
- Skip if no new data since last scan

**Top 10 coins list:**
- Fetch from Bybit REST API: `GET /v5/market/tickers?category=linear`
- Sort by 24h turnover (volume in USD)
- Take top 10 symbols
- Refresh every 24 hours (store in PostgreSQL)
- Fallback: hardcoded list if API fails

**Signal lifecycle:**
- Status: active → expired (24h) or hit (SL/TP reached)
- Auto-expire signals older than 24 hours
- Update signal if structure changes significantly

---

## 6. Telegram Alert Design

### Alert Format

```
🟢 BTCUSDT — BULLISH SIGNAL
━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Confidence: 82% (3/3 layers aligned)
💰 Price: $108,450
📈 Bias: Bullish
⏰ Timeframe: H1

🔧 CONFLUENCE:
├── SMC: BOS bullish + Bull FVG fill
├── Technical: RSI 42 (oversold bounce) + MACD crossover
└── Volume: OBV uptrend + volume spike detected

🎯 SETUPS:
┌─────────────────────────────────────────┐
│ LONG @ $108,200                         │
│ SL: $107,800 (-0.37%)                   │
│ TP: $109,500 (+1.20%)                   │
│ R:R: 3.2                               │
│ Reason: FVG fill at demand zone          │
└─────────────────────────────────────────┘

📝 Reasoning:
BTC showing strong bullish structure on H1.
BOS confirmed at $108,100. Price retraced into
bull FVG ($108,000-$108,200) with RSI oversold
and MACD about to cross. Volume confirms buyers
stepping in. Target previous HH at $109,500.
```

### Alert Rules

- **Threshold:** Only send if confidence ≥ 60%
- **Dedup:** Don't resend same signal within 1 hour
- **Update:** Send update if SL/TP changes significantly (>1%)
- **Expire:** Auto-expire after 24 hours
- **Channel:** Hermes Telegram (existing setup) or direct Bot API

---

## 7. Dashboard Design

### Navigation

**Desktop (Sidebar):**
```
Aegis Terminal
├── Dashboard
├── Forex
│   ├── Signals
│   ├── Analysis
│   └── ...
├── Crypto (NEW)
│   ├── Screener
│   ├── Signals
│   └── /:symbol
└── ...
```

**Mobile (TopBar):**
```
TopBar
├── Home
├── Forex
├── Crypto (NEW)
└── More
```

### Pages

#### `/crypto` — Screener View
- Top 10 coins grid
- Each card: symbol, price, 24h change, signal status
- Color coded: green (bullish), red (bearish), gray (neutral)
- Click → detail view

#### `/crypto/signals` — Signal List View
- All active signals sorted by confidence
- Filter: coin, timeframe, bias
- Each row: symbol, bias, confidence, entry, SL, TP, R:R
- Click → detail view

#### `/crypto/:symbol` — Detail View
- Live price chart (TradingView lightweight)
- Multi-TF view (H4 / H1 / M15 tabs)
- Signal details + reasoning
- Current setups with entry/SL/TP
- Historical signals for this coin

### Data Flow

```
CF Worker → PostgreSQL (VPS)
→ GET /api/crypto/screening (list all coins)
→ GET /api/crypto/signals (active signals)
→ GET /api/crypto/live/:symbol (real-time price)
→ GET /api/crypto/history/:symbol (past signals)
```

**Frontend polling:** 10-30 seconds for live price updates (no WebSocket needed in browser).

---

## 8. API Endpoints

### CF Worker Endpoints

```
GET /api/crypto/screening
  → Returns: { symbols: [...], lastScan: timestamp }
  
GET /api/crypto/signals
  → Query: ?symbol=BTCUSDT&timeframe=H1&bias=bullish&limit=20
  → Returns: { signals: [...], total: number }
  
GET /api/crypto/live/:symbol
  → Returns: { symbol, price, change24h, volume24h, lastUpdate }
  
GET /api/crypto/history/:symbol
  → Query: ?limit=50&offset=0
  → Returns: { signals: [...], total: number }
```

### VPS Endpoints (internal)

```
POST /api/crypto/candles
  → Body: { symbol, timeframe, candles: [...] }
  → Used by WebSocket client to store candles
  
GET /api/crypto/health
  → Returns: { status, wsConnected, lastSignal, uptime }
```

---

## 9. Implementation Plan

### Phase 1: VPS Backend (Week 1)

**1.1 Bybit WebSocket Client**
- File: `vps-api/bybit-ws.js`
- Connect to `wss://stream.bybit.com/v5/public/linear`
- Subscribe: kline H4, H1, M15 for top 10 coins
- Parse kline data → store in PostgreSQL
- Handle reconnection, error handling

**1.2 PostgreSQL Schema**
- Run migration: `crypto_candles`, `crypto_signals`, `crypto_screening`
- Indexes for performance

**1.3 Signal Engine**
- File: `vps-api/crypto-signal-engine.js`
- Port existing SMC logic from `worker/src/routes/signals.ts`
- Add technical indicators (RSI, MACD, EMA, BB, ATR)
- Add volume analysis (OBV, VWAP, volume profile)
- Confluence scoring + setup generation

**1.4 Integration**
- File: `vps-api/server.js` (extend)
- WebSocket client → signal engine → store signals
- Telegram alert integration

### Phase 2: Telegram Alerts (Week 1)

**2.1 Alert System**
- File: `vps-api/crypto-alerts.js`
- Format signal sesuai template
- Dedup + expiry logic
- Send via Hermes Telegram or direct Bot API

### Phase 3: CF Worker API (Week 2)

**3.1 New Endpoints**
- File: `worker/src/routes/crypto.ts`
- `GET /api/crypto/screening`
- `GET /api/crypto/signals`
- `GET /api/crypto/live/:symbol`
- `GET /api/crypto/history/:symbol`

**3.2 Database Connection**
- CF Worker connects to VPS PostgreSQL (via HTTP API or direct)
- Query optimization, caching

### Phase 4: Dashboard UI (Week 2)

**4.1 Screener Page**
- File: `frontend/src/pages/CryptoScreener.tsx`
- Top 10 coins grid
- Live price polling

**4.2 Signal List Page**
- File: `frontend/src/pages/CryptoSignals.tsx`
- Active signals table
- Filters

**4.3 Detail Page**
- File: `frontend/src/pages/CryptoDetail.tsx`
- Live chart
- Multi-TF view
- Signal details

**4.4 Navigation Update**
- Update Sidebar.tsx (desktop)
- Update TopBar.tsx (mobile)
- Sync both nav configs

---

## 10. Technical Considerations

### Bybit WebSocket Rate Limits
- Public channels: 500 subscriptions per connection
- Top 10 coins × 3 timeframes = 30 subscriptions (well within limit)
- Reconnection: exponential backoff (1s, 2s, 4s, 8s, max 30s)

### PostgreSQL Storage
- ~100 candles per symbol per timeframe per day
- 10 symbols × 3 timeframes × 100 candles = 3,000 rows/day
- ~90,000 rows/month (manageable)
- Consider partitioning by month after 6 months

### CF Worker Limitations
- Stateless: can't maintain WebSocket
- Read-only from PostgreSQL (via HTTP API on VPS)
- Cache responses with 30s TTL

### Signal Accuracy
- Backtest against historical data
- Track hit rate, average R:R, max drawdown
- Tune confluence weights based on performance

---

## 11. Future Enhancements (Out of Scope)

- **Auto-trading:** Execute trades via Bybit API (requires write access)
- **More coins:** Expand beyond top 10
- **Machine learning:** Train models on historical signals
- **Portfolio tracking:** Track open positions, P&L
- **Social features:** Share signals, follow top traders
- **Mobile app:** Native iOS/Android app

---

## 12. Success Metrics

- **Signal quality:** ≥ 60% win rate on backtested data
- **Latency:** Signal generated within 30 seconds of kline close
- **Uptime:** 99.5% availability (WebSocket reconnection working)
- **User engagement:** Dashboard loads in < 2 seconds
- **Alert delivery:** Telegram alerts delivered within 10 seconds

---

## Appendix A: Bybit WebSocket Reference

**Connection:**
```
wss://stream.bybit.com/v5/public/linear
```

**Subscribe kline:**
```json
{
  "op": "subscribe",
  "args": ["kline.5.BTCUSDT", "kline.15.BTCUSDT", "kline.60.BTCUSDT", "kline.240.BTCUSDT"]
}
```

**Kline event:**
```json
{
  "topic": "kline.5.BTCUSDT",
  "type": "snapshot",
  "ts": 1672306560000,
  "data": [
    {
      "start": 1672306500000,
      "end": 1672306559999,
      "interval": "5",
      "open": "16845.00",
      "close": "16850.50",
      "high": "16860.00",
      "low": "16840.00",
      "volume": "1234.56",
      "turnover": "20789012.34"
    }
  ]
}
```

**Note:** Bybit uses milliseconds for timestamps, convert to seconds for PostgreSQL.

**Kline interval mapping:**
- Bybit uses numeric intervals: `5` (5m), `15` (15m), `60` (1h), `240` (4h)
- Aegis uses string timeframes: `M5`, `M15`, `H1`, `H4`
- Mapping: `{ "5": "M5", "15": "M15", "60": "H1", "240": "H4" }`

---

## Appendix B: Technical Indicator Formulas

**RSI (14):**
```
RS = avg_gain_14 / avg_loss_14
RSI = 100 - (100 / (1 + RS))
```

**MACD (12, 26, 9):**
```
EMA12 = close * (2/13) + prev_EMA12 * (11/13)
EMA26 = close * (2/27) + prev_EMA26 * (25/27)
MACD = EMA12 - EMA26
Signal = MACD * (2/10) + prev_Signal * (8/10)
Histogram = MACD - Signal
```

**EMA (period):**
```
Multiplier = 2 / (period + 1)
EMA = close * Multiplier + prev_EMA * (1 - Multiplier)
```

**Bollinger Bands (20, 2):**
```
Middle = SMA(20)
Upper = Middle + 2 * StdDev(20)
Lower = Middle - 2 * StdDev(20)
Bandwidth = (Upper - Lower) / Middle
```

**ATR (14):**
```
TR = max(high - low, abs(high - prev_close), abs(low - prev_close))
ATR = SMA(TR, 14)
```

---

**End of Spec**
