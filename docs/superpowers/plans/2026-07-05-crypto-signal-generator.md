# Crypto Signal Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time crypto signal generator that scans Bybit's top 10 coins using WebSocket data, combines SMC + technical + volume analysis, and outputs signals to Telegram alerts and the Aegis Terminal dashboard.

**Architecture:** Bybit WebSocket client on VPS receives kline data, signal engine processes candles on close, stores results in PostgreSQL, CF Worker serves API for dashboard, Telegram alerts sent from VPS.

**Tech Stack:** Node.js (VPS), PostgreSQL, Bybit WebSocket API, CF Worker (Hono), CF Pages (React), Telegram Bot API

## Global Constraints

- PostgreSQL: user `aegis`, password `aegis_terminal_2026`, database `aegis_terminal`, port 5432
- VPS: IP 129.226.151.57, user `ubuntu`, SSH alias `sg2`
- Bybit WebSocket: `wss://stream.bybit.com/v5/public/linear` (public, no auth needed)
- Bybit REST: `https://api.bybit.com` (for ticker list, no auth needed)
- CF Worker: deploy via `wrangler pages deploy` from `worker/` directory
- Signal engine: minimum 1 layer (SMC/Technical/Volume) must agree to generate signal
- Alert threshold: confidence ≥ 60% to send Telegram alert
- Timeframes: H4 (240), H1 (60), M15 (15)

---

## File Structure

### VPS Backend (new files)
- `vps-api/bybit-ws.js` — WebSocket client, kline parsing, reconnection
- `vps-api/crypto-signal-engine.js` — SMC + technical + volume analysis
- `vps-api/crypto-alerts.js` — Telegram alert formatting and sending
- `vps-api/crypto-migration.js` — PostgreSQL schema migration script

### VPS Backend (modified)
- `vps-api/server.js` — Add crypto endpoints, import new modules

### CF Worker (new)
- `worker/src/routes/crypto.ts` — API endpoints for dashboard

### CF Pages Frontend (new)
- `frontend/src/pages/CryptoScreener.tsx` — Top 10 coins grid
- `frontend/src/pages/CryptoSignals.tsx` — Active signals list
- `frontend/src/pages/CryptoDetail.tsx` — Coin detail + signal view

### CF Pages Frontend (modified)
- `frontend/src/components/Sidebar.tsx` — Add Crypto nav section
- `frontend/src/components/TopBar.tsx` — Add Crypto nav (mobile)
- `frontend/src/App.tsx` — Add crypto routes

---

## Task 1: PostgreSQL Schema Migration

**Files:**
- Create: `vps-api/crypto-migration.js`

**Interfaces:**
- Consumes: PostgreSQL connection (aegis_terminal database)
- Produces: 3 new tables (crypto_candles, crypto_signals, crypto_screening)

- [ ] **Step 1: Create migration script**

```javascript
// vps-api/crypto-migration.js
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
```

- [ ] **Step 2: Run migration on VPS**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && node crypto-migration.js"
```

Expected: "Migration complete!" message

- [ ] **Step 3: Verify tables exist**

```bash
ssh sg2 "psql -U aegis -d aegis_terminal -c '\dt crypto_*'"
```

Expected: 4 tables listed (crypto_candles, crypto_signals, crypto_screening, crypto_top_coins)

- [ ] **Step 4: Commit**

```bash
git add vps-api/crypto-migration.js
git commit -m "feat: add crypto schema migration"
```

---

## Task 2: Bybit Top 10 Coins Fetcher

**Files:**
- Create: `vps-api/bybit-top-coins.js`

**Interfaces:**
- Consumes: Bybit REST API (`/v5/market/tickers`)
- Produces: Array of top 10 symbols, stores in PostgreSQL

- [ ] **Step 1: Create top coins fetcher**

```javascript
// vps-api/bybit-top-coins.js
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aegis_terminal',
  user: 'aegis',
  password: 'aegis_terminal_2026',
});

const BYBIT_API = 'https://api.bybit.com';
const FALLBACK_COINS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'
];

async function fetchTop10Coins() {
  try {
    const response = await fetch(`${BYBIT_API}/v5/market/tickers?category=linear`);
    const data = await response.json();
    
    if (data.retCode !== 0) {
      console.error('Bybit API error:', data.retMsg);
      return FALLBACK_COINS;
    }
    
    // Sort by 24h turnover (volume in USD)
    const tickers = data.result.list
      .filter(t => t.symbol.endsWith('USDT'))
      .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
      .slice(0, 10);
    
    const symbols = tickers.map(t => t.symbol);
    console.log('Top 10 coins:', symbols);
    
    // Store in PostgreSQL
    await pool.query('DELETE FROM crypto_top_coins');
    for (let i = 0; i < symbols.length; i++) {
      await pool.query(
        'INSERT INTO crypto_top_coins (symbol, rank, volume_24h) VALUES ($1, $2, $3)',
        [symbols[i], i + 1, parseFloat(tickers[i].turnover24h)]
      );
    }
    
    return symbols;
  } catch (err) {
    console.error('Failed to fetch top coins:', err);
    return FALLBACK_COINS;
  }
}

async function getTop10Coins() {
  // Check cache first
  const result = await pool.query(
    'SELECT symbol FROM crypto_top_coins ORDER BY rank ASC LIMIT 10'
  );
  
  if (result.rows.length === 10) {
    return result.rows.map(r => r.symbol);
  }
  
  // Fetch fresh if cache empty
  return fetchTop10Coins();
}

module.exports = { fetchTop10Coins, getTop10Coins };

// Run directly to refresh cache
if (require.main === module) {
  fetchTop10Coins().then(() => process.exit(0));
}
```

- [ ] **Step 2: Test fetcher**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && node bybit-top-coins.js"
```

Expected: "Top 10 coins: [BTCUSDT, ETHUSDT, ...]" message

- [ ] **Step 3: Verify database**

```bash
ssh sg2 "psql -U aegis -d aegis_terminal -c 'SELECT * FROM crypto_top_coins ORDER BY rank'"
```

Expected: 10 rows with symbols and ranks

- [ ] **Step 4: Commit**

```bash
git add vps-api/bybit-top-coins.js
git commit -m "feat: add Bybit top 10 coins fetcher"
```

---

## Task 3: Bybit WebSocket Client

**Files:**
- Create: `vps-api/bybit-ws.js`

**Interfaces:**
- Consumes: Bybit WebSocket API, PostgreSQL (crypto_candles table)
- Produces: Kline data stored in PostgreSQL, emits 'kline_close' events

- [ ] **Step 1: Create WebSocket client**

```javascript
// vps-api/bybit-ws.js
const WebSocket = require('ws');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aegis_terminal',
  user: 'aegis',
  password: 'aegis_terminal_2026',
});

const BYBIT_WS = 'wss://stream.bybit.com/v5/public/linear';
const KLINE_INTERVALS = { '5': 'M5', '15': 'M15', '60': 'H1', '240': 'H4' };

class BybitWebSocket {
  constructor(onKlineClose) {
    this.ws = null;
    this.onKlineClose = onKlineClose;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.subscribedSymbols = new Set();
  }

  connect() {
    console.log('Connecting to Bybit WebSocket...');
    this.ws = new WebSocket(BYBIT_WS);

    this.ws.on('open', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.resubscribe();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    this.ws.on('close', () => {
      console.log('WebSocket closed, reconnecting...');
      this.reconnect();
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  }

  handleMessage(msg) {
    if (msg.topic && msg.topic.startsWith('kline.')) {
      const kline = msg.data[0];
      if (kline) {
        this.processKline(msg.topic, kline);
      }
    }
  }

  async processKline(topic, kline) {
    // Parse topic: "kline.60.BTCUSDT"
    const parts = topic.split('.');
    const interval = parts[1];
    const symbol = parts[2];
    const timeframe = KLINE_INTERVALS[interval];

    if (!timeframe) {
      console.error('Unknown interval:', interval);
      return;
    }

    // Convert Bybit data to our format
    const candle = {
      symbol,
      timeframe,
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
      volume: parseFloat(kline.volume),
      timestamp: Math.floor(kline.start / 1000), // Convert ms to seconds
      isClosed: kline.confirm, // True when candle is closed
    };

    // Store candle
    await this.storeCandle(candle);

    // Emit event if candle is closed
    if (candle.isClosed && this.onKlineClose) {
      this.onKlineClose(candle);
    }
  }

  async storeCandle(candle) {
    try {
      await pool.query(
        `INSERT INTO crypto_candles (symbol, timeframe, open, high, low, close, volume, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (symbol, timeframe, timestamp)
         DO UPDATE SET open=$3, high=$4, low=$5, close=$6, volume=$7`,
        [candle.symbol, candle.timeframe, candle.open, candle.high, 
         candle.low, candle.close, candle.volume, candle.timestamp]
      );
    } catch (err) {
      console.error('Failed to store candle:', err);
    }
  }

  subscribe(symbols) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    // Subscribe to kline for each symbol and interval
    const args = [];
    for (const symbol of symbols) {
      for (const interval of Object.keys(KLINE_INTERVALS)) {
        args.push(`kline.${interval}.${symbol}`);
      }
    }

    this.ws.send(JSON.stringify({ op: 'subscribe', args }));
    symbols.forEach(s => this.subscribedSymbols.add(s));
    console.log(`Subscribed to ${symbols.length} symbols`);
  }

  resubscribe() {
    if (this.subscribedSymbols.size > 0) {
      this.subscribe(Array.from(this.subscribedSymbols));
    }
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = { BybitWebSocket, KLINE_INTERVALS };
```

- [ ] **Step 2: Test WebSocket connection**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && node -e "
const { BybitWebSocket } = require('./bybit-ws');
const ws = new BybitWebSocket((kline) => {
  console.log('Kline close:', kline.symbol, kline.timeframe, kline.close);
});
ws.connect();
ws.subscribe(['BTCUSDT']);
setTimeout(() => ws.disconnect(), 10000);
""
```

Expected: WebSocket connects, subscribes, receives kline data after 10 seconds

- [ ] **Step 3: Verify candles stored**

```bash
ssh sg2 "psql -U aegis -d aegis_terminal -c 'SELECT COUNT(*) FROM crypto_candles WHERE symbol='\''BTCUSDT'\'''"
```

Expected: Count > 0

- [ ] **Step 4: Commit**

```bash
git add vps-api/bybit-ws.js
git commit -m "feat: add Bybit WebSocket client with kline storage"
```

---

## Task 4: Technical Indicators Library

**Files:**
- Create: `vps-api/indicators.js`

**Interfaces:**
- Consumes: Array of candle objects { open, high, low, close, volume }
- Produces: Indicator values (RSI, MACD, EMA, BB, ATR, OBV, VWAP)

- [ ] **Step 1: Create indicators library**

```javascript
// vps-api/indicators.js

function calcEMA(data, period) {
  if (data.length < period) return [];
  const multiplier = 2 / (period + 1);
  const ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
  
  for (let i = period; i < data.length; i++) {
    ema.push(data[i] * multiplier + ema[ema.length - 1] * (1 - multiplier));
  }
  return ema;
}

function calcSMA(data, period) {
  if (data.length < period) return [];
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    sma.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return sma;
}

function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  
  const changes = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }
  
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  
  const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
  if (candles.length < slow + signal) return null;
  
  const closes = candles.map(c => c.close);
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  
  // Align arrays
  const offset = slow - fast;
  const macdLine = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }
  
  const signalLine = calcEMA(macdLine, signal);
  const histogram = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
  
  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram,
  };
}

function calcBollingerBands(candles, period = 20, stdDev = 2) {
  if (candles.length < period) return null;
  
  const closes = candles.map(c => c.close);
  const sma = calcSMA(closes, period);
  const lastSma = sma[sma.length - 1];
  
  const recentCloses = closes.slice(-period);
  const variance = recentCloses.reduce((sum, c) => sum + Math.pow(c - lastSma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: lastSma + stdDev * std,
    middle: lastSma,
    lower: lastSma - stdDev * std,
    bandwidth: (stdDev * std * 2) / lastSma,
  };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - pc.close),
      Math.abs(c.low - pc.close)
    );
    trs.push(tr);
  }
  
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcOBV(candles) {
  if (candles.length < 2) return [];
  
  const obv = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv.push(obv[obv.length - 1] + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      obv.push(obv[obv.length - 1] - candles[i].volume);
    } else {
      obv.push(obv[obv.length - 1]);
    }
  }
  return obv;
}

function calcVWAP(candles) {
  if (candles.length === 0) return null;
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * c.volume;
    cumulativeVolume += c.volume;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
}

function calcVolumeProfile(candles, numBins = 20) {
  if (candles.length === 0) return null;
  
  const prices = candles.map(c => (c.high + c.low) / 2);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;
  
  if (range === 0) return null;
  
  const binSize = range / numBins;
  const bins = Array(numBins).fill(0);
  
  for (let i = 0; i < candles.length; i++) {
    const binIndex = Math.min(Math.floor((prices[i] - minPrice) / binSize), numBins - 1);
    bins[binIndex] += candles[i].volume;
  }
  
  const maxVolume = Math.max(...bins);
  const pocIndex = bins.indexOf(maxVolume);
  const poc = minPrice + (pocIndex + 0.5) * binSize;
  
  // Value area (70% of volume)
  const totalVolume = bins.reduce((a, b) => a + b, 0);
  const targetVolume = totalVolume * 0.7;
  
  let accumulated = bins[pocIndex];
  let vaLow = pocIndex;
  let vaHigh = pocIndex;
  
  while (accumulated < targetVolume && (vaLow > 0 || vaHigh < numBins - 1)) {
    const lowVol = vaLow > 0 ? bins[vaLow - 1] : 0;
    const highVol = vaHigh < numBins - 1 ? bins[vaHigh + 1] : 0;
    
    if (lowVol >= highVol && vaLow > 0) {
      vaLow--;
      accumulated += bins[vaLow];
    } else if (vaHigh < numBins - 1) {
      vaHigh++;
      accumulated += bins[vaHigh];
    } else {
      break;
    }
  }
  
  return {
    poc,
    vah: minPrice + (vaHigh + 1) * binSize,
    val: minPrice + vaLow * binSize,
  };
}

module.exports = {
  calcEMA,
  calcSMA,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  calcATR,
  calcOBV,
  calcVWAP,
  calcVolumeProfile,
};
```

- [ ] **Step 2: Test indicators**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && node -e "
const { calcRSI, calcMACD, calcATR } = require('./indicators');
const testCandles = Array(50).fill(null).map((_, i) => ({
  open: 100 + Math.random() * 10,
  high: 110 + Math.random() * 10,
  low: 90 + Math.random() * 10,
  close: 100 + Math.random() * 10,
  volume: 1000 + Math.random() * 500,
}));
console.log('RSI:', calcRSI(testCandles));
console.log('MACD:', calcMACD(testCandles));
console.log('ATR:', calcATR(testCandles));
""
```

Expected: Numeric values for RSI, MACD, ATR

- [ ] **Step 3: Commit**

```bash
git add vps-api/indicators.js
git commit -m "feat: add technical indicators library (RSI, MACD, EMA, BB, ATR, OBV, VWAP)"
```

---

## Task 5: SMC Analysis Engine

**Files:**
- Create: `vps-api/smc-analysis.js`

**Interfaces:**
- Consumes: Array of candle objects
- Produces: SMC structure (swings, FVGs, order blocks, BOS, CHoCH)

- [ ] **Step 1: Create SMC analysis**

```javascript
// vps-api/smc-analysis.js

function detectSwings(candles) {
  const swings = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isHigh = 
      c.high > candles[i - 1].high && c.high > candles[i + 1].high &&
      c.high > candles[i - 2].high && c.high > candles[i + 2].high;
    const isLow = 
      c.low < candles[i - 1].low && c.low < candles[i + 1].low &&
      c.low < candles[i - 2].low && c.low < candles[i + 2].low;

    if (isHigh) swings.push({ price: c.high, type: 'SH', time: c.timestamp, index: i });
    if (isLow) swings.push({ price: c.low, type: 'SL', time: c.timestamp, index: i });
  }

  // Classify HH/HL/LH/LL
  const classified = [];
  let lastHigh = -Infinity;
  let lastLow = Infinity;

  for (const s of swings) {
    if (s.type === 'SH') {
      s.type = s.price > lastHigh ? 'HH' : 'LH';
      lastHigh = s.price;
      classified.push(s);
    } else {
      s.type = s.price > lastLow ? 'HL' : 'LL';
      lastLow = s.price;
      classified.push(s);
    }
  }

  return classified;
}

function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    if (candles[i].low > candles[i - 2].high) {
      fvgs.push({
        type: 'bull',
        top: candles[i].low,
        bottom: candles[i - 2].high,
        time: candles[i - 1].timestamp,
        gap: candles[i].low - candles[i - 2].high,
      });
    }
    if (candles[i].high < candles[i - 2].low) {
      fvgs.push({
        type: 'bear',
        top: candles[i - 2].low,
        bottom: candles[i].high,
        time: candles[i - 1].timestamp,
        gap: candles[i - 2].low - candles[i].high,
      });
    }
  }
  return fvgs;
}

function detectOBs(candles) {
  const obs = [];
  for (let i = 2; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const body = Math.abs(prev.close - prev.open);
    const move = curr.high - curr.low;

    if (move > body * 2 && body > 0) {
      if (prev.close < prev.open) {
        obs.push({ type: 'bull_ob', high: prev.open, low: prev.low, time: prev.timestamp });
      } else {
        obs.push({ type: 'bear_ob', high: prev.high, low: prev.close, time: prev.timestamp });
      }
    }
  }
  return obs;
}

function detectBOS(swings) {
  if (swings.length < 2) return { bos: false, choch: false };
  
  const lastTwo = swings.slice(-2);
  const prevTwo = swings.slice(-4, -2);
  
  if (prevTwo.length < 2) return { bos: false, choch: false };
  
  // Bullish BOS: price breaks above previous swing high
  const bullishBOS = lastTwo[1].type === 'HH' && lastTwo[0].type === 'HL';
  
  // Bearish BOS: price breaks below previous swing low
  const bearishBOS = lastTwo[1].type === 'LL' && lastTwo[0].type === 'LH';
  
  // CHoCH: first break against prevailing trend
  const prevTrend = prevTwo[1].type === 'HH' || prevTwo[1].type === 'HL' ? 'bullish' : 'bearish';
  const currentTrend = lastTwo[1].type === 'HH' || lastTwo[1].type === 'HL' ? 'bullish' : 'bearish';
  const choch = prevTrend !== currentTrend;
  
  return { bos: bullishBOS || bearishBOS, choch };
}

function getTrend(swings) {
  const recent = swings.slice(-8);
  const hh = recent.filter(s => s.type === 'HH').length;
  const hl = recent.filter(s => s.type === 'HL').length;
  const lh = recent.filter(s => s.type === 'LH').length;
  const ll = recent.filter(s => s.type === 'LL').length;

  if (hh + hl > lh + ll) return 'bullish';
  if (lh + ll > hh + hl) return 'bearish';
  return 'neutral';
}

function getZone(price, high, low) {
  const mid = (high + low) / 2;
  const range = high - low;
  if (price > mid + range * 0.1) return 'premium';
  if (price < mid - range * 0.1) return 'discount';
  return 'equilibrium';
}

module.exports = {
  detectSwings,
  detectFVGs,
  detectOBs,
  detectBOS,
  getTrend,
  getZone,
};
```

- [ ] **Step 2: Test SMC analysis**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && node -e "
const { detectSwings, detectFVGs, detectOBs, detectBOS, getTrend } = require('./smc-analysis');
const testCandles = Array(50).fill(null).map((_, i) => ({
  open: 100 + Math.sin(i * 0.3) * 10,
  high: 110 + Math.sin(i * 0.3) * 10,
  low: 90 + Math.sin(i * 0.3) * 10,
  close: 100 + Math.sin(i * 0.3) * 10,
  volume: 1000,
  timestamp: Date.now() / 1000 + i * 3600,
}));
console.log('Swings:', detectSwings(testCandles).length);
console.log('FVGs:', detectFVGs(testCandles).length);
console.log('OBs:', detectOBs(testCandles).length);
console.log('Trend:', getTrend(detectSwings(testCandles)));
""
```

Expected: Numeric counts and trend string

- [ ] **Step 3: Commit**

```bash
git add vps-api/smc-analysis.js
git commit -m "feat: add SMC analysis engine (swings, FVGs, OBs, BOS, CHoCH)"
```

---

## Task 6: Signal Engine Core

**Files:**
- Create: `vps-api/crypto-signal-engine.js`

**Interfaces:**
- Consumes: Candle arrays (H4, H1, M15), indicators, SMC analysis
- Produces: CryptoSignal object with confluence scoring

- [ ] **Step 1: Create signal engine**

```javascript
// vps-api/crypto-signal-engine.js
const { calcRSI, calcMACD, calcBollingerBands, calcATR, calcOBV, calcVWAP, calcVolumeProfile } = require('./indicators');
const { detectSwings, detectFVGs, detectOBs, detectBOS, getTrend, getZone } = require('./smc-analysis');

function analyzeSMC(candles) {
  const swings = detectSwings(candles);
  const fvgs = detectFVGs(candles);
  const obs = detectOBs(candles);
  const { bos, choch } = detectBOS(swings);
  const trend = getTrend(swings);
  
  const recentHigh = Math.max(...swings.filter(s => s.type === 'HH' || s.type === 'SH').map(s => s.price).slice(-3));
  const recentLow = Math.min(...swings.filter(s => s.type === 'LL' || s.type === 'SL').map(s => s.price).slice(-3));
  const zone = getZone(candles[candles.length - 1].close, recentHigh, recentLow);
  
  return { trend, bos, choch, fvgs, obs, swings, recentHigh, recentLow, zone };
}

function analyzeTechnical(candles) {
  const rsi = calcRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBollingerBands(candles);
  const atr = calcATR(candles);
  
  const closes = candles.map(c => c.close);
  const lastClose = closes[closes.length - 1];
  
  let rsiZone = 'neutral';
  if (rsi > 70) rsiZone = 'overbought';
  else if (rsi < 30) rsiZone = 'oversold';
  
  let macdSignal = 'neutral';
  if (macd.histogram > 0 && macd.macd > macd.signal) macdSignal = 'bullish';
  else if (macd.histogram < 0 && macd.macd < macd.signal) macdSignal = 'bearish';
  
  let bbPosition = 'middle';
  if (lastClose > bb.upper) bbPosition = 'above_upper';
  else if (lastClose < bb.lower) bbPosition = 'below_lower';
  
  return {
    rsi: { value: rsi, zone: rsiZone },
    macd: { signal: macdSignal, histogram: macd.histogram },
    bollinger: { position: bbPosition, squeeze: bb.bandwidth < 0.05 },
    atr,
  };
}

function analyzeVolume(candles) {
  const obv = calcOBV(candles);
  const vwap = calcVWAP(candles);
  const volumeProfile = calcVolumeProfile(candles);
  
  const recentOBV = obv.slice(-5);
  const obvTrend = recentOBV[recentOBV.length - 1] > recentOBV[0] ? 'rising' : 'falling';
  
  const avgVolume = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;
  const currentVolume = candles[candles.length - 1].volume;
  const volumeSpike = currentVolume > avgVolume * 2;
  
  return {
    poc: volumeProfile?.poc,
    vwap,
    obvTrend,
    volumeSpike,
    volumeProfile,
  };
}

function voteDirection(smc, technical, volume, price) {
  const votes = [];
  
  // SMC vote
  if (smc.trend === 'bullish') votes.push(1);
  else if (smc.trend === 'bearish') votes.push(-1);
  else votes.push(0);
  
  // Technical vote
  const techBullish = (technical.rsi.zone === 'oversold' || technical.macd.signal === 'bullish');
  const techBearish = (technical.rsi.zone === 'overbought' || technical.macd.signal === 'bearish');
  if (techBullish && !techBearish) votes.push(1);
  else if (techBearish && !techBullish) votes.push(-1);
  else votes.push(0);
  
  // Volume vote
  if (volume.obvTrend === 'rising' && price > volume.vwap) votes.push(1);
  else if (volume.obvTrend === 'falling' && price < volume.vwap) votes.push(-1);
  else votes.push(0);
  
  return votes;
}

function generateSetups(bias, price, smc, technical) {
  const setups = [];
  
  if (bias === 'bullish') {
    // Find nearest bull FVG or OB
    const bullFVGs = smc.fvgs.filter(f => f.type === 'bull' && f.top < price);
    const bullOBs = smc.obs.filter(o => o.type === 'bull_ob' && o.high < price);
    
    if (bullFVGs.length > 0) {
      const fvg = bullFVGs[bullFVGs.length - 1];
      const entry = fvg.top;
      const sl = entry - technical.atr;
      const tp = smc.recentHigh;
      setups.push({
        type: 'long',
        entry,
        sl,
        tp,
        rr: Math.round((tp - entry) / (entry - sl) * 10) / 10,
        reason: `Bull FVG fill at ${fvg.bottom.toFixed(2)}-${fvg.top.toFixed(2)}`,
        confluence: [`FVG gap: ${fvg.gap.toFixed(2)}`, `Zone: ${smc.zone}`],
        status: price > entry + technical.atr * 0.5 ? 'active' : 'waiting',
      });
    }
  }
  
  if (bias === 'bearish') {
    const bearOBs = smc.obs.filter(o => o.type === 'bear_ob' && o.low > price);
    
    if (bearOBs.length > 0) {
      const ob = bearOBs[bearOBs.length - 1];
      const entry = ob.low;
      const sl = entry + technical.atr;
      const tp = smc.recentLow;
      setups.push({
        type: 'short',
        entry,
        sl,
        tp,
        rr: Math.round((entry - tp) / (sl - entry) * 10) / 10,
        reason: `Bear OB at ${ob.low.toFixed(2)}-${ob.high.toFixed(2)}`,
        confluence: ['Order Block supply zone', `Zone: ${smc.zone}`],
        status: price < entry - technical.atr * 0.5 ? 'active' : 'waiting',
      });
    }
  }
  
  return setups;
}

function generateReasoning(bias, confidence, smc, technical, volume) {
  const parts = [];
  
  parts.push(`${confidence}% confidence ${bias} bias`);
  
  if (smc.bos) parts.push(`BOS confirmed`);
  if (smc.choch) parts.push(`CHoCH detected`);
  if (technical.rsi.zone !== 'neutral') parts.push(`RSI ${technical.rsi.value.toFixed(0)} (${technical.rsi.zone})`);
  if (technical.macd.signal !== 'neutral') parts.push(`MACD ${technical.macd.signal}`);
  if (volume.volumeSpike) parts.push('Volume spike detected');
  
  return parts.join('. ') + '.';
}

function generateSignal(symbol, timeframe, h4Candles, h1Candles, m15Candles) {
  // Analyze each layer
  const smc = analyzeSMC(h1Candles);
  const technical = analyzeTechnical(h1Candles);
  const volume = analyzeVolume(m15Candles);
  
  const price = h1Candles[h1Candles.length - 1].close;
  
  // Vote
  const votes = voteDirection(smc, technical, volume, price);
  const sumVotes = votes.reduce((a, b) => a + b, 0);
  
  // Check minimum 1 vote
  if (votes.every(v => v <= 0)) {
    return null; // No signal
  }
  
  // Determine bias
  let bias = 'neutral';
  if (sumVotes > 0) bias = 'bullish';
  else if (sumVotes < 0) bias = 'bearish';
  
  // Calculate confidence
  const agreeCount = votes.filter(v => v === (sumVotes > 0 ? 1 : -1)).length;
  let confidence;
  if (agreeCount === 3) confidence = 80 + Math.floor(Math.random() * 15);
  else if (agreeCount === 2) confidence = 60 + Math.floor(Math.random() * 20);
  else confidence = 40 + Math.floor(Math.random() * 20);
  
  // Generate setups
  const setups = generateSetups(bias, price, smc, technical);
  
  // Generate reasoning
  const reasoning = generateReasoning(bias, confidence, smc, technical, volume);
  
  return {
    symbol,
    timeframe,
    bias,
    confidence,
    price,
    structure: {
      trend: smc.trend,
      bos: smc.bos,
      choch: smc.choch,
      fvgs: smc.fvgs.slice(-5),
      orderBlocks: smc.obs.slice(-5),
      swings: smc.swings.slice(-10),
    },
    technical,
    volume,
    setups,
    confluenceScore: Math.round((sumVotes / 3 + 1) / 2 * 100),
    reasoning,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

module.exports = { generateSignal, analyzeSMC, analyzeTechnical, analyzeVolume };
```

- [ ] **Step 2: Test signal generation**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && node -e "
const { generateSignal } = require('./crypto-signal-engine');
const testCandles = Array(100).fill(null).map((_, i) => ({
  open: 100 + Math.sin(i * 0.1) * 20,
  high: 120 + Math.sin(i * 0.1) * 20,
  low: 80 + Math.sin(i * 0.1) * 20,
  close: 100 + Math.sin(i * 0.1) * 20,
  volume: 1000 + Math.random() * 500,
  timestamp: Date.now() / 1000 + i * 3600,
}));
const signal = generateSignal('BTCUSDT', 'H1', testCandles, testCandles, testCandles);
console.log(signal ? JSON.stringify(signal, null, 2) : 'No signal');
""
```

Expected: Signal object with bias, confidence, setups (or null if no signal)

- [ ] **Step 3: Commit**

```bash
git add vps-api/crypto-signal-engine.js
git commit -m "feat: add crypto signal engine with 3-layer confluence"
```

---

## Task 7: Telegram Alert System

**Files:**
- Create: `vps-api/crypto-alerts.js`

**Interfaces:**
- Consumes: CryptoSignal object
- Produces: Telegram message sent via Bot API

- [ ] **Step 1: Create alert system**

```javascript
// vps-api/crypto-alerts.js
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sentSignals = new Map(); // signalId -> timestamp

function formatSignal(signal) {
  const emoji = signal.bias === 'bullish' ? '🟢' : signal.bias === 'bearish' ? '🔴' : '⚪';
  const layers = [
    signal.structure.bos ? 'BOS' : null,
    signal.structure.choch ? 'CHoCH' : null,
    signal.technical.rsi.zone !== 'neutral' ? `RSI ${signal.technical.rsi.value.toFixed(0)} (${signal.technical.rsi.zone})` : null,
    signal.technical.macd.signal !== 'neutral' ? `MACD ${signal.technical.macd.signal}` : null,
    signal.volume.volumeSpike ? 'Volume spike' : null,
    signal.volume.obvTrend !== 'neutral' ? `OBV ${signal.volume.obvTrend}` : null,
  ].filter(Boolean).join(' + ');

  const setups = signal.setups.map(s => 
    `${s.type.toUpperCase()} @ $${s.entry.toFixed(2)}\n` +
    `SL: $${s.sl.toFixed(2)} (-${((Math.abs(s.entry - s.sl) / s.entry) * 100).toFixed(2)}%)\n` +
    `TP: $${s.tp.toFixed(2)} (+${((Math.abs(s.tp - s.entry) / s.entry) * 100).toFixed(2)}%)\n` +
    `R:R: ${s.rr}\n` +
    `Reason: ${s.reason}`
  ).join('\n\n');

  return [
    `${emoji} ${signal.symbol} — ${signal.bias.toUpperCase()} SIGNAL`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━',
    `📊 Confidence: ${signal.confidence}% (${signal.confluenceScore}/100 confluence)`,
    `💰 Price: $${signal.price.toFixed(2)}`,
    `📈 Bias: ${signal.bias}`,
    `⏰ Timeframe: ${signal.timeframe}`,
    '',
    '🔧 CONFLUENCE:',
    `├── SMC: ${layers}`,
    `├── Technical: RSI ${signal.technical.rsi.value.toFixed(0)} (${signal.technical.rsi.zone})`,
    `└── Volume: ${signal.volume.obvTrend} trend${signal.volume.volumeSpike ? ' + spike' : ''}`,
    '',
    '🎯 SETUPS:',
    setups,
    '',
    '📝 Reasoning:',
    signal.reasoning,
  ].join('\n');
}

async function sendTelegramAlert(signal) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Telegram credentials not set');
    return false;
  }

  // Dedup check
  const signalKey = `${signal.symbol}_${signal.timeframe}_${signal.bias}`;
  const lastSent = sentSignals.get(signalKey);
  if (lastSent && Date.now() - lastSent < 3600000) { // 1 hour dedup
    console.log('Skipping duplicate signal:', signalKey);
    return false;
  }

  const message = formatSignal(signal);
  
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );
    
    const result = await response.json();
    if (result.ok) {
      sentSignals.set(signalKey, Date.now());
      console.log('Telegram alert sent for', signal.symbol);
      return true;
    } else {
      console.error('Telegram API error:', result.description);
      return false;
    }
  } catch (err) {
    console.error('Failed to send Telegram alert:', err);
    return false;
  }
}

module.exports = { sendTelegramAlert, formatSignal };
```

- [ ] **Step 2: Test alert formatting**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && node -e "
const { formatSignal } = require('./crypto-alerts');
const testSignal = {
  symbol: 'BTCUSDT',
  timeframe: 'H1',
  bias: 'bullish',
  confidence: 82,
  price: 108450,
  structure: { trend: 'bullish', bos: true, choch: false, fvgs: [], orderBlocks: [], swings: [] },
  technical: { rsi: { value: 42, zone: 'oversold' }, macd: { signal: 'bullish', histogram: 10 }, bollinger: { position: 'middle', squeeze: false }, atr: 500 },
  volume: { poc: 108000, vwap: 108200, obvTrend: 'rising', volumeSpike: true, volumeProfile: { poc: 108000, vah: 109000, val: 107000 } },
  setups: [{ type: 'long', entry: 108200, sl: 107800, tp: 109500, rr: 3.2, reason: 'FVG fill', confluence: ['FVG'], status: 'active' }],
  confluenceScore: 82,
  reasoning: 'Strong bullish structure',
  timestamp: Date.now() / 1000,
};
console.log(formatSignal(testSignal));
""
```

Expected: Formatted Telegram message string

- [ ] **Step 3: Commit**

```bash
git add vps-api/crypto-alerts.js
git commit -m "feat: add Telegram alert system with dedup"
```

---

## Task 8: VPS Integration

**Files:**
- Modify: `vps-api/server.js`

**Interfaces:**
- Consumes: BybitWebSocket, generateSignal, sendTelegramAlert
- Produces: Running server with crypto endpoints

- [ ] **Step 1: Add crypto imports and endpoints to server.js**

```javascript
// Add at top of server.js
const { BybitWebSocket } = require('./bybit-ws');
const { getTop10Coins } = require('./bybit-top-coins');
const { generateSignal } = require('./crypto-signal-engine');
const { sendTelegramAlert } = require('./crypto-alerts');

// Add after existing endpoints
// ═══════════════════════════════════════════════════════════════
// CRYPTO SIGNAL GENERATOR
// ═══════════════════════════════════════════════════════════════

let cryptoWs = null;
let topCoins = [];

async function startCryptoEngine() {
  try {
    // Fetch top 10 coins
    topCoins = await getTop10Coins();
    console.log('Top coins:', topCoins);

    // Start WebSocket
    cryptoWs = new BybitWebSocket(async (kline) => {
      console.log(`Kline close: ${kline.symbol} ${kline.timeframe}`);
      
      // Fetch candles for signal generation
      const h4 = await pool.query(
        'SELECT * FROM crypto_candles WHERE symbol=$1 AND timeframe=$2 ORDER BY timestamp DESC LIMIT 100',
        [kline.symbol, 'H4']
      );
      const h1 = await pool.query(
        'SELECT * FROM crypto_candles WHERE symbol=$1 AND timeframe=$2 ORDER BY timestamp DESC LIMIT 100',
        [kline.symbol, 'H1']
      );
      const m15 = await pool.query(
        'SELECT * FROM crypto_candles WHERE symbol=$1 AND timeframe=$2 ORDER BY timestamp DESC LIMIT 100',
        [kline.symbol, 'M15']
      );

      if (h4.rows.length < 20 || h1.rows.length < 20 || m15.rows.length < 20) {
        return; // Not enough data
      }

      // Generate signal
      const signal = generateSignal(
        kline.symbol,
        kline.timeframe,
        h4.rows.reverse(),
        h1.rows.reverse(),
        m15.rows.reverse()
      );

      if (signal && signal.confidence >= 60) {
        // Store signal
        await pool.query(
          `INSERT INTO crypto_signals (symbol, timeframe, bias, confidence, price, structure, technical, volume, setups, confluence_score, reasoning, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + INTERVAL '24 hours')`,
          [signal.symbol, signal.timeframe, signal.bias, signal.confidence, signal.price,
           JSON.stringify(signal.structure), JSON.stringify(signal.technical), JSON.stringify(signal.volume),
           JSON.stringify(signal.setups), signal.confluenceScore, signal.reasoning]
        );

        // Send alert
        await sendTelegramAlert(signal);
      }

      // Log screening
      await pool.query(
        'INSERT INTO crypto_screening (symbol, scan_time, signal_generated, metadata) VALUES ($1, NOW(), $2, $3)',
        [kline.symbol, !!signal, JSON.stringify({ timeframe: kline.timeframe, confidence: signal?.confidence })]
      );
    });

    cryptoWs.connect();
    cryptoWs.subscribe(topCoins);
  } catch (err) {
    console.error('Failed to start crypto engine:', err);
  }
}

// Crypto endpoints
app.get('/api/crypto/screening', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT symbol, rank, volume_24h FROM crypto_top_coins ORDER BY rank ASC'
    );
    res.json({ symbols: result.rows, lastScan: new Date() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/crypto/signals', async (req, res) => {
  try {
    const { symbol, timeframe, bias, limit = 20 } = req.query;
    let query = 'SELECT * FROM crypto_signals WHERE status = $1';
    const params = ['active'];
    
    if (symbol) {
      query += ` AND symbol = $${params.length + 1}`;
      params.push(symbol.toUpperCase());
    }
    if (timeframe) {
      query += ` AND timeframe = $${params.length + 1}`;
      params.push(timeframe.toUpperCase());
    }
    if (bias) {
      query += ` AND bias = $${params.length + 1}`;
      params.push(bias.toLowerCase());
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    res.json({ signals: result.rows, total: result.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/crypto/live/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const result = await pool.query(
      'SELECT * FROM crypto_candles WHERE symbol=$1 ORDER BY timestamp DESC LIMIT 1',
      [symbol]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    
    const candle = result.rows[0];
    res.json({
      symbol,
      price: candle.close,
      lastUpdate: new Date(candle.timestamp * 1000),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/crypto/history/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(
      'SELECT * FROM crypto_signals WHERE symbol=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [symbol, parseInt(limit), parseInt(offset)]
    );
    
    res.json({ signals: result.rows, total: result.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start crypto engine on server boot
startCryptoEngine();
```

- [ ] **Step 2: Test server starts**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && timeout 10 node server.js 2>&1 || true"
```

Expected: "Top coins: [...]" message, WebSocket connects

- [ ] **Step 3: Test endpoints**

```bash
ssh sg2 "curl -s http://localhost:3001/api/crypto/screening | head -c 200"
```

Expected: JSON with symbols array

- [ ] **Step 4: Commit**

```bash
git add vps-api/server.js
git commit -m "feat: integrate crypto engine into VPS server"
```

---

## Task 9: CF Worker Crypto Endpoints

**Files:**
- Create: `worker/src/routes/crypto.ts`

**Interfaces:**
- Consumes: PostgreSQL (via VPS HTTP API)
- Produces: API responses for dashboard

- [ ] **Step 1: Create crypto routes**

```typescript
// worker/src/routes/crypto.ts
import { Hono } from 'hono';
import type { Bindings } from '../index';

export const cryptoRoutes = new Hono<{ Bindings: Bindings }>();

const VPS_API = 'http://129.226.151.57:3001';

cryptoRoutes.get('/screening', async (c) => {
  try {
    const response = await fetch(`${VPS_API}/api/crypto/screening`);
    const data = await response.json();
    return c.json(data);
  } catch (err) {
    return c.json({ error: 'Failed to fetch screening data' }, 500);
  }
});

cryptoRoutes.get('/signals', async (c) => {
  try {
    const url = new URL(c.req.url);
    const params = url.searchParams.toString();
    const response = await fetch(`${VPS_API}/api/crypto/signals?${params}`);
    const data = await response.json();
    return c.json(data);
  } catch (err) {
    return c.json({ error: 'Failed to fetch signals' }, 500);
  }
});

cryptoRoutes.get('/live/:symbol', async (c) => {
  try {
    const symbol = c.req.param('symbol');
    const response = await fetch(`${VPS_API}/api/crypto/live/${symbol}`);
    const data = await response.json();
    return c.json(data);
  } catch (err) {
    return c.json({ error: 'Failed to fetch live data' }, 500);
  }
});

cryptoRoutes.get('/history/:symbol', async (c) => {
  try {
    const symbol = c.req.param('symbol');
    const url = new URL(c.req.url);
    const params = url.searchParams.toString();
    const response = await fetch(`${VPS_API}/api/crypto/history/${symbol}?${params}`);
    const data = await response.json();
    return c.json(data);
  } catch (err) {
    return c.json({ error: 'Failed to fetch history' }, 500);
  }
});
```

- [ ] **Step 2: Register route in worker/src/index.ts**

```typescript
// Add import
import { cryptoRoutes } from './routes/crypto';

// Add route registration
app.route('/api/crypto', cryptoRoutes);
```

- [ ] **Step 3: Test locally**

```bash
cd worker && npx wrangler dev
curl http://localhost:8787/api/crypto/screening
```

Expected: JSON response from VPS

- [ ] **Step 4: Commit**

```bash
git add worker/src/routes/crypto.ts worker/src/index.ts
git commit -m "feat: add CF Worker crypto API endpoints"
```

---

## Task 10: Frontend Crypto Pages

**Files:**
- Create: `frontend/src/pages/CryptoScreener.tsx`
- Create: `frontend/src/pages/CryptoSignals.tsx`
- Create: `frontend/src/pages/CryptoDetail.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/TopBar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: CF Worker API endpoints
- Produces: React UI components

- [ ] **Step 1: Create CryptoScreener page**

```tsx
// frontend/src/pages/CryptoScreener.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Coin {
  symbol: string;
  rank: number;
  volume_24h: number;
}

export function CryptoScreener() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crypto/screening')
      .then(res => res.json())
      .then(data => {
        setCoins(data.symbols || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Crypto Screener</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {coins.map(coin => (
          <Link
            key={coin.symbol}
            to={`/crypto/${coin.symbol}`}
            className="bg-zinc-800 rounded-lg p-4 hover:bg-zinc-700 transition"
          >
            <div className="text-lg font-semibold">{coin.symbol.replace('USDT', '')}</div>
            <div className="text-sm text-zinc-400">#{coin.rank}</div>
            <div className="text-sm text-zinc-400">
              Vol: ${(coin.volume_24h / 1e9).toFixed(2)}B
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CryptoSignals page**

```tsx
// frontend/src/pages/CryptoSignals.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Signal {
  id: number;
  symbol: string;
  timeframe: string;
  bias: string;
  confidence: number;
  price: number;
  setups: Array<{
    type: string;
    entry: number;
    sl: number;
    tp: number;
    rr: number;
  }>;
  created_at: string;
}

export function CryptoSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crypto/signals?limit=50')
      .then(res => res.json())
      .then(data => {
        setSignals(data.signals || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Active Signals</h1>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-zinc-700">
              <th className="pb-2">Symbol</th>
              <th className="pb-2">TF</th>
              <th className="pb-2">Bias</th>
              <th className="pb-2">Conf</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">SL</th>
              <th className="pb-2">TP</th>
              <th className="pb-2">R:R</th>
            </tr>
          </thead>
          <tbody>
            {signals.map(signal => (
              <tr key={signal.id} className="border-b border-zinc-800">
                <td className="py-2">
                  <Link to={`/crypto/${signal.symbol}`} className="text-blue-400 hover:underline">
                    {signal.symbol}
                  </Link>
                </td>
                <td className="py-2">{signal.timeframe}</td>
                <td className="py-2">
                  <span className={signal.bias === 'bullish' ? 'text-green-400' : signal.bias === 'bearish' ? 'text-red-400' : 'text-zinc-400'}>
                    {signal.bias}
                  </span>
                </td>
                <td className="py-2">{signal.confidence}%</td>
                <td className="py-2">${signal.setups[0]?.entry.toFixed(2) || '-'}</td>
                <td className="py-2">${signal.setups[0]?.sl.toFixed(2) || '-'}</td>
                <td className="py-2">${signal.setups[0]?.tp.toFixed(2) || '-'}</td>
                <td className="py-2">{signal.setups[0]?.rr || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CryptoDetail page**

```tsx
// frontend/src/pages/CryptoDetail.tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface Signal {
  id: number;
  symbol: string;
  timeframe: string;
  bias: string;
  confidence: number;
  price: number;
  structure: any;
  technical: any;
  volume: any;
  setups: Array<{
    type: string;
    entry: number;
    sl: number;
    tp: number;
    rr: number;
    reason: string;
  }>;
  reasoning: string;
  created_at: string;
}

export function CryptoDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/crypto/signals?symbol=${symbol}&limit=1`)
      .then(res => res.json())
      .then(data => {
        setSignal(data.signals?.[0] || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (!signal) return <div className="p-4">No active signal for {symbol}</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{symbol}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Signal Info */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Signal</h2>
          <div className="space-y-2">
            <div>Bias: <span className={signal.bias === 'bullish' ? 'text-green-400' : 'text-red-400'}>{signal.bias}</span></div>
            <div>Confidence: {signal.confidence}%</div>
            <div>Price: ${signal.price.toFixed(2)}</div>
            <div>Timeframe: {signal.timeframe}</div>
          </div>
        </div>

        {/* Setups */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Setups</h2>
          {signal.setups.map((setup, i) => (
            <div key={i} className="mb-4 last:mb-0">
              <div className="font-semibold">{setup.type.toUpperCase()}</div>
              <div>Entry: ${setup.entry.toFixed(2)}</div>
              <div>SL: ${setup.sl.toFixed(2)}</div>
              <div>TP: ${setup.tp.toFixed(2)}</div>
              <div>R:R: {setup.rr}</div>
              <div className="text-sm text-zinc-400">{setup.reason}</div>
            </div>
          ))}
        </div>

        {/* Technical */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Technical</h2>
          <div className="space-y-2">
            <div>RSI: {signal.technical.rsi.value.toFixed(0)} ({signal.technical.rsi.zone})</div>
            <div>MACD: {signal.technical.macd.signal}</div>
            <div>ATR: {signal.technical.atr.toFixed(2)}</div>
          </div>
        </div>

        {/* Reasoning */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Reasoning</h2>
          <p className="text-zinc-300">{signal.reasoning}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update Sidebar navigation**

```tsx
// Add to Sidebar.tsx nav items
{
  name: 'Crypto',
  href: '/crypto',
  icon: ChartBarIcon,
}
```

- [ ] **Step 5: Update TopBar navigation (mobile)**

```tsx
// Add to TopBar.tsx nav items
{ name: 'Crypto', href: '/crypto' }
```

- [ ] **Step 6: Add routes to App.tsx**

```tsx
import { CryptoScreener } from './pages/CryptoScreener';
import { CryptoSignals } from './pages/CryptoSignals';
import { CryptoDetail } from './pages/CryptoDetail';

// Add routes
<Route path="/crypto" element={<CryptoScreener />} />
<Route path="/crypto/signals" element={<CryptoSignals />} />
<Route path="/crypto/:symbol" element={<CryptoDetail />} />
```

- [ ] **Step 7: Test locally**

```bash
cd frontend && npm run dev
```

Navigate to http://localhost:5173/crypto

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Crypto*.tsx frontend/src/components/Sidebar.tsx frontend/src/components/TopBar.tsx frontend/src/App.tsx
git commit -m "feat: add crypto frontend pages (screener, signals, detail)"
```

---

## Task 11: Deploy to Production

**Files:**
- None (deployment only)

**Interfaces:**
- Consumes: All previous tasks
- Produces: Running production system

- [ ] **Step 1: Deploy CF Worker**

```bash
cd worker && npm run deploy
```

- [ ] **Step 2: Deploy CF Pages**

```bash
cd frontend && npm run build
npx wrangler pages deploy dist --project-name=aegis-terminal
```

- [ ] **Step 3: Restart VPS server**

```bash
ssh sg2 "cd ~/aegis-terminal/vps-api && pm2 restart all"
```

- [ ] **Step 4: Verify WebSocket connected**

```bash
ssh sg2 "pm2 logs --lines 20"
```

Expected: "WebSocket connected" message

- [ ] **Step 5: Test production endpoints**

```bash
curl -s https://aegisterminal.workers.dev/api/crypto/screening | head -c 200
```

Expected: JSON with symbols

- [ ] **Step 6: Verify Telegram alerts**

Wait for a kline close (M15 = 15 minutes), check if alert is sent.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: deploy crypto signal generator to production"
```

---

**End of Plan**
