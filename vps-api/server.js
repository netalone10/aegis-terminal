const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { getMarketRegime, getCorrelationChains, getSymbolBias } = require('./fundamental-engine');
const { getMetrics, getTopProcesses, getServices, seedMetrics } = require('./system-metrics');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aegis_terminal',
  user: 'aegis',
  password: 'aegis_terminal_2026',
  max: 10,
});

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'];

// ─── Killzones ────────────────────────────────────────────────
const KILLZONES = [
  { name: 'London Open', h4Time: '13:00', session: 'London', priority: 1 },
  { name: 'London Lunch', h4Time: '17:00', session: 'London', priority: 2 },
  { name: 'New York', h4Time: '21:00', session: 'New York', priority: 1 },
];
// ─── MT5 Feed API Helper ────────────────────────────────────
const MT5_API = process.env.MT5_API_URL || 'http://localhost:8500';
const MT5_KEY = process.env.MT5_API_KEY || 'ThLNeGzMMCRcPsLSicfq9OCHkfIiJdrcVJaN0d8d9Mo';

async function fetchMT5Candles(symbol, timeframe, count = 30) {
  try {
    const res = await fetch(`${MT5_API}/candles?symbol=${symbol}&timeframe=${timeframe}&count=${count}`, {
      headers: { 'X-API-Key': MT5_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`MT5 ${res.status}`);
    const data = await res.json();
    return (data.candles || []).map(c => ({
      timestamp: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume || 0,
    }));
  } catch (e) {
    console.error(`[MT5] fetch ${symbol} ${timeframe} failed: ${e.message}`);
    return [];
  }
}

// H4 model detection (extracted from /api/h4-profile)
function detectH4Signals(candles, activeKillzone) {
  const signals = [];
  const recent = candles.slice(-15);
  for (let i = 4; i < recent.length; i++) {
    const c5 = recent[i];
    if (i >= 4) {
      const c1to4 = recent.slice(i - 4, i);
      const structHigh = Math.max(...c1to4.map(c => c.high));
      const structLow = Math.min(...c1to4.map(c => c.low));
      if (c5.high > structHigh && c5.close < c5.open && c5.close < structHigh) {
        signals.push({ model: 1, trigger_type: 'candle_5_reversal', killzone: activeKillzone?.name || null, bias: 'bearish', key_level: c5.high, confidence: 70, h4_candle_time: c5.timestamp });
      }
      if (c5.low < structLow && c5.close > c5.open && c5.close > structLow) {
        signals.push({ model: 1, trigger_type: 'candle_5_reversal', killzone: activeKillzone?.name || null, bias: 'bullish', key_level: c5.low, confidence: 70, h4_candle_time: c5.timestamp });
      }
    }
    if (i >= 8) {
      const c1to8 = recent.slice(i - 8, i);
      const structHigh = Math.max(...c1to8.map(c => c.high));
      const structLow = Math.min(...c1to8.map(c => c.low));
      const c9 = recent[i];
      if (c9.high > structHigh && c9.close < c9.open) {
        signals.push({ model: 3, trigger_type: 'candle_9_reversal', killzone: activeKillzone?.name || null, bias: 'bearish', key_level: c9.high, confidence: 65, h4_candle_time: c9.timestamp });
      }
      if (c9.low < structLow && c9.close > c9.open) {
        signals.push({ model: 3, trigger_type: 'candle_9_reversal', killzone: activeKillzone?.name || null, bias: 'bullish', key_level: c9.low, confidence: 65, h4_candle_time: c9.timestamp });
      }
      if (c9.close > structHigh && c9.close > c9.open) {
        signals.push({ model: 2, trigger_type: 'candle_9_continue', killzone: activeKillzone?.name || null, bias: 'bullish', key_level: structHigh, confidence: 55, h4_candle_time: c9.timestamp });
      }
      if (c9.close < structLow && c9.close < c9.open) {
        signals.push({ model: 2, trigger_type: 'candle_9_continue', killzone: activeKillzone?.name || null, bias: 'bearish', key_level: structLow, confidence: 55, h4_candle_time: c9.timestamp });
      }
    }
    if (i >= 4) {
      const c1 = recent[i - 4];
      const c2to4 = recent.slice(i - 3, i);
      const avgBody = c2to4.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 3;
      const c1Body = Math.abs(c1.close - c1.open);
      if (c1.close > c1.open && c1Body > avgBody * 1.2) {
        const allUp = c2to4.every(c => c.close > c.open);
        if (allUp) signals.push({ model: 4, trigger_type: 'candle_1_reversal', killzone: activeKillzone?.name || null, bias: 'bullish', key_level: c1.low, confidence: 60, h4_candle_time: c1.timestamp });
      }
      if (c1.close < c1.open && c1Body > avgBody * 1.2) {
        const allDown = c2to4.every(c => c.close < c.open);
        if (allDown) signals.push({ model: 4, trigger_type: 'candle_1_reversal', killzone: activeKillzone?.name || null, bias: 'bearish', key_level: c1.high, confidence: 60, h4_candle_time: c1.timestamp });
      }
    }
  }
  return signals;
}

// H1 confirmation (extracted from /api/h1-confirm)
function confirmH1(h4Signal, h1Candles) {
  if (h1Candles.length < 2) return { confirmed: false };
  const c1 = h1Candles[0];
  const c2 = h1Candles[1];
  let oholFormed = false, oholType = null, confirmationType = null;
  if (c1.close > c2.close) { oholFormed = true; oholType = 'OH'; confirmationType = h4Signal.bias === 'bearish' ? 'reversal' : 'continue'; }
  if (c1.close < c2.close) { oholFormed = true; oholType = 'OL'; confirmationType = h4Signal.bias === 'bullish' ? 'reversal' : 'continue'; }
  let extraConfirmations = 0;
  if (h1Candles.length >= 3) {
    for (let i = 2; i < h1Candles.length; i++) {
      if (h4Signal.bias === 'bullish' && h1Candles[i].close > h1Candles[i - 1].close) extraConfirmations++;
      if (h4Signal.bias === 'bearish' && h1Candles[i].close < h1Candles[i - 1].close) extraConfirmations++;
    }
  }
  const confirmed = oholFormed && extraConfirmations > 0;
  const confidence = Math.min(100, h4Signal.confidence + (confirmed ? 15 : 0) + (extraConfirmations * 5));
  return { confirmed, oholFormed, oholType, confirmationType, extraConfirmations, confidence };
}

// M15 entry engine (extracted from /api/entry)
function detectM15Entry(candles, h4Bias) {
  if (candles.length < 20) return { ready: false, po3Phase: 'accumulation', mss: null, fvgStage: 0 };

  // PO3 Detection
  const recentATR = calcATR(candles.slice(-20), 14);
  const last20 = candles.slice(-20);
  const rangeHigh = Math.max(...last20.map(c => c.high));
  const rangeLow = Math.min(...last20.map(c => c.low));
  const rangeSize = rangeHigh - rangeLow;

  let po3Phase = 'accumulation';
  let manipulationSweep = null;
  const last5 = candles.slice(-5);
  for (const c of last5) {
    if (c.high > rangeHigh) { po3Phase = 'manipulation'; manipulationSweep = { level: c.high, type: 'high' }; break; }
    if (c.low < rangeLow) { po3Phase = 'manipulation'; manipulationSweep = { level: c.low, type: 'low' }; break; }
  }
  if (po3Phase === 'manipulation' && manipulationSweep) {
    const lastCandle = candles[candles.length - 1];
    const impulseSize = Math.abs(lastCandle.close - lastCandle.open);
    if (impulseSize > rangeSize * 0.3) po3Phase = 'distribution';
  }

  // MSS Detection
  let mss = null;
  const swingHighs = [], swingLows = [];
  for (let i = 2; i < last20.length - 2; i++) {
    if (last20[i].high > last20[i-1].high && last20[i].high > last20[i+1].high && last20[i].high > last20[i-2].high && last20[i].high > last20[i+2].high)
      swingHighs.push({ price: last20[i].high, index: i });
    if (last20[i].low < last20[i-1].low && last20[i].low < last20[i+1].low && last20[i].low < last20[i-2].low && last20[i].low < last20[i+2].low)
      swingLows.push({ price: last20[i].low, index: i });
  }
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  if (swingHighs.length > 0) {
    const lastSH = swingHighs[swingHighs.length - 1];
    if (lastCandle.close > lastSH.price && prevCandle.close <= lastSH.price) {
      const displacement = Math.abs(lastCandle.close - lastCandle.open) > (recentATR || rangeSize * 0.05);
      if (displacement) mss = { type: 'bullish_mss', level: lastSH.price, displacement: true, timestamp: lastCandle.timestamp };
    }
  }
  if (swingLows.length > 0 && !mss) {
    const lastSL = swingLows[swingLows.length - 1];
    if (lastCandle.close < lastSL.price && prevCandle.close >= lastSL.price) {
      const displacement = Math.abs(lastCandle.close - lastCandle.open) > (recentATR || rangeSize * 0.05);
      if (displacement) mss = { type: 'bearish_mss', level: lastSL.price, displacement: true, timestamp: lastCandle.timestamp };
    }
  }

  // FVG Detection
  let fvgStage = 0, fvgType = null, fvgTop = null, fvgBottom = null;
  if (mss) {
    const isBullish = mss.type === 'bullish_mss';
    let fvgsFound = 0;
    const mssIndex = candles.findIndex(c => c.timestamp === mss.timestamp);
    if (mssIndex >= 0) {
      for (let i = mssIndex + 1; i < candles.length - 1 && fvgsFound < 2; i++) {
        const prev = candles[i - 1], curr = candles[i], next = candles[i + 1];
        if (isBullish) {
          if (next.low > prev.high && curr.close > curr.open) { fvgsFound++; if (fvgsFound === 2) { fvgStage = 2; fvgType = 'bull'; fvgTop = next.low; fvgBottom = prev.high; } }
        } else {
          if (next.high < prev.low && curr.close < curr.open) { fvgsFound++; if (fvgsFound === 2) { fvgStage = 2; fvgType = 'bear'; fvgTop = prev.low; fvgBottom = next.high; } }
        }
      }
      if (fvgsFound === 1 && fvgStage === 0) { fvgStage = 1; fvgType = isBullish ? 'bull' : 'bear'; }
    }
  }

  // Generate entry signal
  let ready = false, entrySignal = null;
  if (mss && fvgStage === 2) {
    const isLong = mss.type === 'bullish_mss';
    const entry = isLong ? fvgBottom : fvgTop;
    const sl = isLong ? mss.level - (recentATR || rangeSize * 0.05) : mss.level + (recentATR || rangeSize * 0.05);
    const risk = Math.abs(entry - sl);
    const tp = isLong ? entry + risk * 2.5 : entry - risk * 2.5;
    const rr = Math.abs(tp - entry) / Math.max(risk, 0.0001);
    if (rr >= 2) {
      ready = true;
      const confluence = [];
      if (po3Phase === 'distribution') confluence.push('po3_distribution');
      if (mss.displacement) confluence.push('displacement');
      if (fvgStage === 2) confluence.push('fvg_stage_2');
      entrySignal = { direction: isLong ? 'long' : 'short', entry, sl, tp, rr, po3_phase: po3Phase, mss_level: mss.level, fvg_stage: fvgStage, fvg_type: fvgType, confluence, confidence: Math.min(95, 50 + (confluence.length * 15)) };
    }
  }

  return { ready, po3Phase, mss: mss ? { type: mss.type, level: mss.level } : null, fvgStage, fvgType, fvgTop, fvgBottom, entrySignal, confidence: entrySignal ? entrySignal.confidence : (mss ? 30 : 0) };
}

// SMT divergence detection (extracted from /api/smt)
function detectSMT(p1Candles, p2Candles, smtPair) {
  if (p1Candles.length < 3 || p2Candles.length < 3) return null;
  const signals = [];
  for (let i = 2; i < Math.min(p1Candles.length, p2Candles.length); i++) {
    const p1SweptHigh = p1Candles[i].high > p1Candles[i-1].high && p1Candles[i].high > p1Candles[i-2].high;
    const p2SweptHigh = p2Candles[i].high > p2Candles[i-1].high && p2Candles[i].high > p2Candles[i-2].high;
    const p1SweptLow = p1Candles[i].low < p1Candles[i-1].low && p1Candles[i].low < p1Candles[i-2].low;
    const p2SweptLow = p2Candles[i].low < p2Candles[i-1].low && p2Candles[i].low < p2Candles[i-2].low;
    if (smtPair.correlation === 'inverse') {
      if (p1SweptHigh && !p2SweptHigh) signals.push({ type: 'bearish_smt', confidence: 65 });
      if (!p1SweptHigh && p2SweptHigh) signals.push({ type: 'bullish_smt', confidence: 65 });
    } else {
      if (p1SweptHigh && !p2SweptHigh) signals.push({ type: 'bearish_smt', confidence: 60 });
      if (!p1SweptHigh && p2SweptHigh) signals.push({ type: 'bullish_smt', confidence: 60 });
    }
    if (p1SweptLow && !p2SweptLow) signals.push({ type: 'bullish_smt', confidence: 60 });
    if (!p1SweptLow && p2SweptLow) signals.push({ type: 'bearish_smt', confidence: 60 });
  }
  if (signals.length === 0) return null;
  // Return the latest signal
  return signals[signals.length - 1];
}



// ─── Day Profiles ─────────────────────────────────────────────
const DAY_PROFILES = {
  1: { day: 'monday', type: 'manipulation', fundamentalWeight: 0.3 },
  2: { day: 'tuesday', type: 'continuation', fundamentalWeight: 0.8 },
  3: { day: 'wednesday', type: 'reversal', fundamentalWeight: 1.2 },
  4: { day: 'thursday', type: 'expansion', fundamentalWeight: 0.9 },
  5: { day: 'friday', type: 'distribution', fundamentalWeight: 1.5 },
};

// ─── SMT Pairs ────────────────────────────────────────────────
const SMT_PAIRS = [
  { pair1: 'XAUUSD', pair2: 'USDJPY', correlation: 'inverse' },
  { pair1: 'EURUSD', pair2: 'GBPUSD', correlation: 'positive' },
];

// ─── Helper Functions ─────────────────────────────────────────
function getWeekStart(ts) {
  let d;
  // Handle both unix timestamps and YYYY-MM-DD date strings
  if (typeof ts === 'number') {
    d = new Date(ts * 1000);
  } else if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ts)) {
    d = new Date(ts + 'T00:00:00Z');
  } else {
    d = new Date(parseFloat(ts) * 1000);
  }
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function getISOWeek(ts) {
  const d = new Date((typeof ts === "number" ? ts : parseFloat(ts)) * 1000);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function isNearEvent(dateStr, minutesThreshold = 30) {
  return pool.query(
    `SELECT 1 FROM economic_events e
     JOIN event_releases er ON er.event_id = e.id
     WHERE er.release_date = $1
     AND ABS(EXTRACT(EPOCH FROM ($2::timestamp - (er.release_date::text || ' ' || e.release_time_utc::text)::timestamp)) / 60) < $3
     AND e.impact_tier IN ('S+', 'S', 'A')
     LIMIT 1`,
    [dateStr, dateStr, minutesThreshold]
  ).then(r => r.rowCount > 0);
}

function detectSequence(open, high, low, close) {
  return close > open ? 'OLHC' : 'OHLC';
}

function calcATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc.close), Math.abs(c.low - pc.close));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 0: DATA INGESTION
// ═══════════════════════════════════════════════════════════════

app.post('/api/candles/:symbol/:timeframe', async (req, res) => {
  try {
    const { symbol, timeframe } = req.params;
    const candles = req.body.candles || [req.body];
    if (!Array.isArray(candles) || candles.length === 0) {
      return res.status(400).json({ error: 'Body must contain candles array' });
    }
    const inserted = [];
    for (const c of candles) {
      const { rows } = await pool.query(
        `INSERT INTO historical_ohlc (symbol, timeframe, open, high, low, close, volume, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (symbol, timeframe, timestamp)
         DO UPDATE SET open=$3, high=$4, low=$5, close=$6, volume=$7
         RETURNING *`,
        [symbol.toUpperCase(), timeframe.toUpperCase(), c.open, c.high, c.low, c.close, c.volume || 0, c.timestamp]
      );
      inserted.push(rows[0]);
    }
    res.json({ status: 'ok', data: inserted, count: inserted.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/event-release', async (req, res) => {
  try {
    const { event_id, release_date, consensus, previous, actual, revision_prev, affected_pairs_move } = req.body;
    if (!event_id || !release_date || actual === undefined) {
      return res.status(400).json({ error: 'Missing required fields: event_id, release_date, actual' });
    }
    const surprise_pct = (consensus && consensus !== 0) ? ((actual - consensus) / Math.abs(consensus)) : null;
    const total_surprise = (surprise_pct || 0) + ((revision_prev && previous) ? (revision_prev - previous) / Math.abs(previous || 1) : 0);

    const { rows } = await pool.query(
      `INSERT INTO event_releases (event_id, release_date, consensus, previous, actual, revision_prev, surprise_pct, total_surprise, affected_pairs_move)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [event_id, release_date, consensus, previous, actual, revision_prev, surprise_pct, total_surprise, JSON.stringify(affected_pairs_move || {})]
    );

    // Update fundamental_bias for affected symbols
    const eventRes = await pool.query('SELECT affected_symbols FROM economic_events WHERE id=$1', [event_id]);
    if (eventRes.rows.length > 0 && eventRes.rows[0].affected_symbols) {
      for (const sym of eventRes.rows[0].affected_symbols) {
        const biasDir = surprise_pct > 0.05 ? 'bullish' : surprise_pct < -0.05 ? 'bearish' : 'neutral';
        await pool.query(
          `INSERT INTO fundamental_bias (symbol, bias_date, bias, score, last_surprise, last_surprise_direction)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (symbol, bias_date)
           DO UPDATE SET last_surprise=$5, last_surprise_direction=$6`,
          [sym, release_date, biasDir, surprise_pct * 100, surprise_pct, surprise_pct > 0 ? 'positive' : 'negative']
        );
      }
    }
    res.json({ status: 'ok', data: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PHASE 1: WEEKLY PROFILE ENGINE
// ═══════════════════════════════════════════════════════════════

app.get('/api/weekly-profile/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // 1. Fetch W1 candles (current + previous 2 weeks)
    const w1 = await pool.query(
      `SELECT * FROM historical_ohlc WHERE symbol=$1 AND timeframe='W1'
       ORDER BY timestamp DESC LIMIT 3`, [symbol]
    );
    if (w1.rows.length === 0) {
      return res.json({ status: 'ok', data: null, message: 'No weekly candle data' });
    }

    const currentWeek = w1.rows[0];
    const prevWeek = w1.rows.length > 1 ? w1.rows[1] : null;

    // 2. Fetch D1 candles for current week
    const weekStart = getWeekStart(currentWeek.timestamp);
    const d1 = await pool.query(
      `SELECT * FROM historical_ohlc WHERE symbol=$1 AND timeframe='D1'
       AND timestamp >= EXTRACT(EPOCH FROM $2::date)::bigint AND timestamp < EXTRACT(EPOCH FROM ($2::date + interval '7 days'))::bigint
       ORDER BY timestamp ASC`, [symbol, weekStart]
    );
    const dayCandles = d1.rows;

    // 3. Detect model
    let model = 'classic_expansion';
    let modelConfidence = 50;

    if (dayCandles.length >= 5) {
      const mon = dayCandles[0];
      const tue = dayCandles[1];
      const wed = dayCandles[2];
      const thu = dayCandles[3];
      const fri = dayCandles[4];

      const weekHigh = Math.max(...dayCandles.map(c => c.high));
      const weekLow = Math.min(...dayCandles.map(c => c.low));

      const tueExtremity = Math.max(
        Math.abs(tue.high - weekHigh) < 0.01 ? 1 : 0,
        Math.abs(tue.low - weekLow) < 0.01 ? 1 : 0
      );
      const wedExtremity = Math.max(
        Math.abs(wed.high - weekHigh) < 0.01 ? 1 : 0,
        Math.abs(wed.low - weekLow) < 0.01 ? 1 : 0
      );
      const thuExtremity = Math.max(
        Math.abs(thu.high - weekHigh) < 0.01 ? 1 : 0,
        Math.abs(thu.low - weekLow) < 0.01 ? 1 : 0
      );

      const monRange = mon.high - mon.low;
      const tueRange = tue.high - tue.low;
      const wedRange = wed.high - wed.low;
      const avgRange = (monRange + tueRange + wedRange) / 3;

      // Classic: Tue makes extreme, Wed-Thu expand
      if (tueExtremity && (thu.high > wed.high || thu.low < wed.low)) {
        model = 'classic_expansion';
        modelConfidence = 75;
      }
      // Consolidation: Mon-Wed sideways, Thu extreme, Fri reverses
      else if (avgRange < (monRange * 1.2) && thuExtremity) {
        model = 'consolidation_reversal';
        modelConfidence = 70;
      }
      // Midweek: Wed extreme, Thu-Fri reverse
      else if (wedExtremity) {
        model = 'midweek_reversal';
        modelConfidence = 72;
      }
    }

    // 4. Detect OHLC sequence
    const sequence = detectSequence(currentWeek.open, currentWeek.high, currentWeek.low, currentWeek.close);

    // 5. Rank days 1-5
    const dayRankings = [];
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    for (let i = 0; i < 5; i++) {
      const profile = DAY_PROFILES[i + 1];
      let score = Math.round(profile.fundamentalWeight * 3);
      if (i === 0) score = 1; // Monday always low
      if (i === 4 && model !== 'consolidation_reversal') score = 2; // Friday low unless reversal week
      score = Math.max(1, Math.min(5, score));
      dayRankings.push({
        day: dayNames[i],
        score,
        highProbability: score >= 4,
        reason: `${profile.type} profile, weight ${profile.fundamentalWeight}x`,
      });
    }

    // 6. Calculate confidence
    let confidence = modelConfidence;
    if (dayCandles.length >= 5) confidence += 10;
    if (prevWeek) confidence += 5;
    confidence = Math.min(100, confidence);

    // 7. Store in weekly_profiles
    const bias = sequence === 'OLHC' ? 'bullish' : 'bearish';
    const weekType = model;
    await pool.query(
      `INSERT INTO weekly_profiles (symbol, week_start, model, bias, sequence, day_rankings, open, high, low, close, confidence, week_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (symbol, week_start) DO UPDATE SET model=$3, bias=$4, sequence=$5, day_rankings=$6, open=$7, high=$8, low=$9, close=$10, confidence=$11, week_type=$12
       RETURNING id`,
      [symbol, weekStart, model, bias, sequence, JSON.stringify(dayRankings),
       currentWeek.open, currentWeek.high, currentWeek.low, currentWeek.close, confidence, weekType]
    );

    res.json({
      status: 'ok',
      data: {
        symbol, model, bias, sequence, confidence,
        weekHigh: currentWeek.high, weekLow: currentWeek.low,
        dayRankings, weekType,
        open: currentWeek.open, close: currentWeek.close,
        previousWeek: prevWeek ? { open: prevWeek.open, high: prevWeek.high, low: prevWeek.low, close: prevWeek.close } : null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PHASE 2: H4 PROFILING ENGINE
// ═══════════════════════════════════════════════════════════════

app.get('/api/h4-profile/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Fetch H4 candles (last 30 to have enough for model detection)
    const h4 = await pool.query(
      `SELECT * FROM historical_ohlc WHERE symbol=$1 AND timeframe='H4'
       ORDER BY timestamp DESC LIMIT 30`, [symbol]
    );
    if (h4.rows.length < 5) {
      return res.json({ status: 'ok', data: { activeKillzone: null, signals: [], profilingPhase: 'no_data' } });
    }

    const candles = h4.rows.reverse();
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB (UTC+7)
    const utcHour = now.getUTCHours();

    // Determine active killzone
    let activeKillzone = null;
    let profilingPhase = 'monitor';
    for (const kz of KILLZONES) {
      const kzHour = parseInt(kz.h4Time.split(':')[0]);
      if (utcHour >= kzHour && utcHour < kzHour + 4) {
        activeKillzone = kz;
        profilingPhase = utcHour === kzHour ? 'monitor' : 'validate';
        break;
      }
    }

    // Detect H4 models on recent candles
    const signals = [];
    const recentCandles = candles.slice(-15);

    for (let i = 4; i < recentCandles.length; i++) {
      const c5 = recentCandles[i];

      // Model 1: Candles 1-4 form structure, candle 5 sweeps + reverses
      if (i >= 4) {
        const c1to4 = recentCandles.slice(i - 4, i);
        const structHigh = Math.max(...c1to4.map(c => c.high));
        const structLow = Math.min(...c1to4.map(c => c.low));

        // Sweep high then reverse (bearish)
        if (c5.high > structHigh && c5.close < c5.open && c5.close < structHigh) {
          signals.push({
            model: 1, trigger_type: 'candle_5_reversal',
            killzone: activeKillzone ? activeKillzone.name : null,
            bias: 'bearish', key_level: c5.high, confidence: 70,
            h4_candle_time: c5.timestamp,
          });
        }
        // Sweep low then reverse (bullish)
        if (c5.low < structLow && c5.close > c5.open && c5.close > structLow) {
          signals.push({
            model: 1, trigger_type: 'candle_5_reversal',
            killzone: activeKillzone ? activeKillzone.name : null,
            bias: 'bullish', key_level: c5.low, confidence: 70,
            h4_candle_time: c5.timestamp,
          });
        }
      }

      // Model 2 & 3: Candles 1-8 form structure, candle 9 continues or sweeps
      if (i >= 8) {
        const c1to8 = recentCandles.slice(i - 8, i);
        const structHigh = Math.max(...c1to8.map(c => c.high));
        const structLow = Math.min(...c1to8.map(c => c.low));
        const c9 = recentCandles[i];

        // Model 3: candle 9 sweeps + reverses
        if (c9.high > structHigh && c9.close < c9.open) {
          signals.push({
            model: 3, trigger_type: 'candle_9_reversal',
            killzone: activeKillzone ? activeKillzone.name : null,
            bias: 'bearish', key_level: c9.high, confidence: 65,
            h4_candle_time: c9.timestamp,
          });
        }
        if (c9.low < structLow && c9.close > c9.open) {
          signals.push({
            model: 3, trigger_type: 'candle_9_reversal',
            killzone: activeKillzone ? activeKillzone.name : null,
            bias: 'bullish', key_level: c9.low, confidence: 65,
            h4_candle_time: c9.timestamp,
          });
        }

        // Model 2: candle 9 continues (no sweep, just break)
        if (c9.close > structHigh && c9.close > c9.open) {
          signals.push({
            model: 2, trigger_type: 'candle_9_continue',
            killzone: activeKillzone ? activeKillzone.name : null,
            bias: 'bullish', key_level: structHigh, confidence: 55,
            h4_candle_time: c9.timestamp,
          });
        }
        if (c9.close < structLow && c9.close < c9.open) {
          signals.push({
            model: 2, trigger_type: 'candle_9_continue',
            killzone: activeKillzone ? activeKillzone.name : null,
            bias: 'bearish', key_level: structLow, confidence: 55,
            h4_candle_time: c9.timestamp,
          });
        }
      }

      // Model 4: Candle 1 is reversal, candles 2-4 confirm
      if (i >= 4) {
        const c1 = recentCandles[i - 4];
        const c2to4 = recentCandles.slice(i - 3, i);
        const avgBody = c2to4.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 3;
        const c1Body = Math.abs(c1.close - c1.open);

        // Bullish reversal: c1 big bullish, c2-4 continue up
        if (c1.close > c1.open && c1Body > avgBody * 1.2) {
          const allUp = c2to4.every(c => c.close > c.open);
          if (allUp) {
            signals.push({
              model: 4, trigger_type: 'candle_1_reversal',
              killzone: activeKillzone ? activeKillzone.name : null,
              bias: 'bullish', key_level: c1.low, confidence: 60,
              h4_candle_time: c1.timestamp,
            });
          }
        }
        // Bearish reversal: c1 big bearish, c2-4 continue down
        if (c1.close < c1.open && c1Body > avgBody * 1.2) {
          const allDown = c2to4.every(c => c.close < c.open);
          if (allDown) {
            signals.push({
              model: 4, trigger_type: 'candle_1_reversal',
              killzone: activeKillzone ? activeKillzone.name : null,
              bias: 'bearish', key_level: c1.high, confidence: 60,
              h4_candle_time: c1.timestamp,
            });
          }
        }
      }
    }

    // Get weekly profile for context
    const wpRes = await pool.query(
      `SELECT id FROM weekly_profiles WHERE symbol=$1 ORDER BY week_start DESC LIMIT 1`, [symbol]
    );
    const weeklyProfileId = wpRes.rows.length > 0 ? wpRes.rows[0].id : null;

    // Store signals
    const storedSignals = [];
    for (const sig of signals.slice(-3)) {
      const { rows } = await pool.query(
        `INSERT INTO h4_signals (symbol, h4_candle_time, model, trigger_type, killzone, bias, key_level, confidence, weekly_profile_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [symbol, new Date(sig.h4_candle_time * 1000).toISOString(), sig.model, sig.trigger_type, sig.killzone, sig.bias, sig.key_level, sig.confidence, weeklyProfileId]
      );
      storedSignals.push(rows[0]);
    }

    res.json({
      status: 'ok',
      data: {
        activeKillzone,
        signals: storedSignals.length > 0 ? storedSignals : signals,
        profilingPhase,
        totalSignals: signals.length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PHASE 3: H1 CONFIRMATION ENGINE
// ═══════════════════════════════════════════════════════════════

app.get('/api/h1-confirm/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const h4SignalId = req.query.h4SignalId;

    // Get H4 signal
    let h4Signal;
    if (h4SignalId) {
      const r = await pool.query('SELECT * FROM h4_signals WHERE id=$1', [h4SignalId]);
      h4Signal = r.rows[0];
    } else {
      const r = await pool.query(
        'SELECT * FROM h4_signals WHERE symbol=$1 ORDER BY created_at DESC LIMIT 1', [symbol]
      );
      h4Signal = r.rows[0];
    }

    if (!h4Signal) {
      return res.json({ status: 'ok', data: { confirmed: false, message: 'No H4 signal found' } });
    }

    // Get H1 candles from current H4 candle time (4 H1 candles = 1 H4 candle)
    const h4Time = h4Signal.h4_candle_time;
    const h1 = await pool.query(
      `SELECT * FROM historical_ohlc WHERE symbol=$1 AND timeframe='H1'
       AND timestamp >= (EXTRACT(EPOCH FROM $2::timestamp) - 3600)::bigint
       AND timestamp < (EXTRACT(EPOCH FROM $2::timestamp) + 14400)::bigint
       ORDER BY timestamp ASC`, [symbol, h4Time]
    );

    if (h1.rows.length < 2) {
      return res.json({ status: 'ok', data: { confirmed: false, message: 'Insufficient H1 data' } });
    }

    const h1Candles = h1.rows;
    const c1 = h1Candles[0];
    const c2 = h1Candles.length > 1 ? h1Candles[1] : null;

    // OH/OL Detection
    let oholFormed = false;
    let oholType = null;
    let confirmationType = null;

    if (c1 && c2) {
      // OH (Open-High): C1 close > C2 close → bearish
      if (c1.close > c2.close) {
        oholFormed = true;
        oholType = 'OH';
        confirmationType = h4Signal.bias === 'bearish' ? 'reversal' : 'continue';
      }
      // OL (Open-Low): C1 close < C2 close → bullish
      if (c1.close < c2.close) {
        oholFormed = true;
        oholType = 'OL';
        confirmationType = h4Signal.bias === 'bullish' ? 'reversal' : 'continue';
      }
    }

    // Check additional candles for stronger confirmation
    let extraConfirmations = 0;
    if (h1Candles.length >= 3) {
      for (let i = 2; i < h1Candles.length; i++) {
        if (h4Signal.bias === 'bullish' && h1Candles[i].close > h1Candles[i - 1].close) extraConfirmations++;
        if (h4Signal.bias === 'bearish' && h1Candles[i].close < h1Candles[i - 1].close) extraConfirmations++;
      }
    }

    const confirmed = oholFormed && extraConfirmations > 0;
    const confidence = Math.min(100, h4Signal.confidence + (confirmed ? 15 : 0) + (extraConfirmations * 5));

    // Determine confirmation model
    let confirmModel = 1;
    if (oholType === 'OL' && h4Signal.bias === 'bullish') confirmModel = 2;
    if (oholType === 'OL' && h4Signal.bias === 'bearish') confirmModel = 3;
    if (oholType === 'OH' && h4Signal.bias === 'bearish') confirmModel = 4;

    // Store confirmation
    const { rows } = await pool.query(
      `INSERT INTO h1_confirmations (symbol, h4_signal_id, model, confirmation_type, ohol_formed, h1_candles, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [symbol, h4Signal.id, confirmModel, confirmationType, oholFormed, JSON.stringify(h1Candles.map(c => ({
        timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close
      }))), confidence]
    );

    // Update h4_signal confirmed status
    if (confirmed) {
      await pool.query('UPDATE h4_signals SET confirmed=true WHERE id=$1', [h4Signal.id]);
    }

    res.json({
      status: 'ok',
      data: {
        confirmed,
        confirmationType,
        model: confirmModel,
        oholFormed,
        oholType,
        h1Candles: h1Candles.length,
        extraConfirmations,
        confidence,
        h4SignalId: h4Signal.id,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PHASE 4: M15 ENTRY ENGINE
// ═══════════════════════════════════════════════════════════════

app.get('/api/entry/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Fetch M15 candles (last 40 for pattern detection)
    const m15 = await pool.query(
      `SELECT * FROM historical_ohlc WHERE symbol=$1 AND timeframe='M15'
       ORDER BY timestamp DESC LIMIT 40`, [symbol]
    );
    if (m15.rows.length < 10) {
      return res.json({ status: 'ok', data: { ready: false, message: 'Insufficient M15 data' } });
    }
    const candles = m15.rows.reverse();

    // --- PO3 Detection ---
    // Accumulation: sideways range with ATR compression
    const recentATR = calcATR(candles.slice(-20), 14);
    const olderATR = calcATR(candles.slice(-40, -20), 14);
    const atrCompression = recentATR && olderATR ? recentATR / olderATR : 1;

    const last20 = candles.slice(-20);
    const rangeHigh = Math.max(...last20.map(c => c.high));
    const rangeLow = Math.min(...last20.map(c => c.low));
    const rangeSize = rangeHigh - rangeLow;

    let po3Phase = 'accumulation';
    let manipulationSweep = null;

    // Check if recent candles swept the range
    const last5 = candles.slice(-5);
    for (const c of last5) {
      if (c.high > rangeHigh) {
        po3Phase = 'manipulation';
        manipulationSweep = { level: c.high, type: 'high' };
        break;
      }
      if (c.low < rangeLow) {
        po3Phase = 'manipulation';
        manipulationSweep = { level: c.low, type: 'low' };
        break;
      }
    }

    // If manipulation detected, check for distribution (impulse)
    if (po3Phase === 'manipulation' && manipulationSweep) {
      const lastCandle = candles[candles.length - 1];
      const impulseSize = Math.abs(lastCandle.close - lastCandle.open);
      if (impulseSize > rangeSize * 0.3) {
        po3Phase = 'distribution';
      }
    }

    // --- MSS Detection ---
    let mss = null;
    // Find swing highs and lows in last 20 candles
    const swingHighs = [];
    const swingLows = [];
    for (let i = 2; i < last20.length - 2; i++) {
      if (last20[i].high > last20[i - 1].high && last20[i].high > last20[i + 1].high &&
          last20[i].high > last20[i - 2].high && last20[i].high > last20[i + 2].high) {
        swingHighs.push({ price: last20[i].high, index: i });
      }
      if (last20[i].low < last20[i - 1].low && last20[i].low < last20[i + 1].low &&
          last20[i].low < last20[i - 2].low && last20[i].low < last20[i + 2].low) {
        swingLows.push({ price: last20[i].low, index: i });
      }
    }

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    // Bullish MSS: break above previous lower high + displacement
    if (swingHighs.length > 0) {
      const lastSwingHigh = swingHighs[swingHighs.length - 1];
      if (lastCandle.close > lastSwingHigh.price && prevCandle.close <= lastSwingHigh.price) {
        const displacement = Math.abs(lastCandle.close - lastCandle.open) > (recentATR || rangeSize * 0.05);
        if (displacement) {
          mss = { type: 'bullish_mss', level: lastSwingHigh.price, displacement: true, timestamp: lastCandle.timestamp };
        }
      }
    }

    // Bearish MSS: break below previous higher low + displacement
    if (swingLows.length > 0 && !mss) {
      const lastSwingLow = swingLows[swingLows.length - 1];
      if (lastCandle.close < lastSwingLow.price && prevCandle.close >= lastSwingLow.price) {
        const displacement = Math.abs(lastCandle.close - lastCandle.open) > (recentATR || rangeSize * 0.05);
        if (displacement) {
          mss = { type: 'bearish_mss', level: lastSwingLow.price, displacement: true, timestamp: lastCandle.timestamp };
        }
      }
    }

    // --- FVG Detection ---
    let fvgStage = 0;
    let fvgType = null;
    let fvgTop = null;
    let fvgBottom = null;

    if (mss) {
      const isBullish = mss.type === 'bullish_mss';
      let fvgsFound = 0;

      // Scan for FVGs after MSS
      const mssIndex = candles.findIndex(c => c.timestamp === mss.timestamp);
      if (mssIndex >= 0) {
        for (let i = mssIndex + 1; i < candles.length - 1 && fvgsFound < 2; i++) {
          const prev = candles[i - 1];
          const curr = candles[i];
          const next = candles[i + 1];

          if (isBullish) {
            // Bullish FVG: gap between prev high and next low (next low > prev high)
            if (next.low > prev.high && curr.close > curr.open) {
              fvgsFound++;
              if (fvgsFound === 1) {
                // Stage 1: don't enter
              }
              if (fvgsFound === 2) {
                fvgStage = 2;
                fvgType = 'bull';
                fvgTop = next.low;
                fvgBottom = prev.high;
              }
            }
          } else {
            // Bearish FVG: gap between prev low and next high (next high < prev low)
            if (next.high < prev.low && curr.close < curr.open) {
              fvgsFound++;
              if (fvgsFound === 1) {
                // Stage 1: don't enter
              }
              if (fvgsFound === 2) {
                fvgStage = 2;
                fvgType = 'bear';
                fvgTop = prev.low;
                fvgBottom = next.high;
              }
            }
          }
        }

        // If only 1 FVG found, mark as stage 1
        if (fvgsFound === 1 && fvgStage === 0) {
          fvgStage = 1;
          fvgType = isBullish ? 'bull' : 'bear';
        }
      }
    }

    // --- Generate Entry Signal ---
    let ready = false;
    let entrySignal = null;

    if (mss && fvgStage === 2) {
      const isLong = mss.type === 'bullish_mss';
      const entry = isLong ? fvgBottom : fvgTop;
      const sl = isLong ? mss.level - (recentATR || rangeSize * 0.05) : mss.level + (recentATR || rangeSize * 0.05);
      const risk = Math.abs(entry - sl);
      const tp = isLong ? entry + risk * 2.5 : entry - risk * 2.5;
      const rr = Math.abs(tp - entry) / Math.max(risk, 0.0001);

      if (rr >= 2) {
        ready = true;
        const confluence = [];
        if (po3Phase === 'distribution') confluence.push('po3_distribution');
        if (mss.displacement) confluence.push('displacement');
        if (fvgStage === 2) confluence.push('fvg_stage_2');

        // Get weekly profile
        const wpRes = await pool.query(
          `SELECT id FROM weekly_profiles WHERE symbol=$1 ORDER BY week_start DESC LIMIT 1`, [symbol]
        );
        const weeklyProfileId = wpRes.rows.length > 0 ? wpRes.rows[0].id : null;

        // Get latest h4_signal
        const h4Res = await pool.query(
          `SELECT id FROM h4_signals WHERE symbol=$1 AND bias=$2 ORDER BY created_at DESC LIMIT 1`,
          [symbol, isLong ? 'bullish' : 'bearish']
        );
        const h4SignalId = h4Res.rows.length > 0 ? h4Res.rows[0].id : null;

        // Get latest h1_confirmation
        const h1Res = await pool.query(
          `SELECT id FROM h1_confirmations WHERE symbol=$1 ORDER BY created_at DESC LIMIT 1`, [symbol]
        );
        const h1ConfirmationId = h1Res.rows.length > 0 ? h1Res.rows[0].id : null;

        entrySignal = {
          symbol,
          direction: isLong ? 'long' : 'short',
          entry: Math.round(entry * 10000) / 10000,
          sl: Math.round(sl * 10000) / 10000,
          tp: Math.round(tp * 10000) / 10000,
          rr: Math.round(rr * 100) / 100,
          po3_phase: po3Phase,
          mss_level: mss.level,
          fvg_stage: fvgStage,
          confluence,
          confidence: Math.min(100, 60 + (fvgStage === 2 ? 15 : 0) + (po3Phase === 'distribution' ? 10 : 0)),
          weekly_profile_id: weeklyProfileId,
          h4_signal_id: h4SignalId,
          h1_confirmation_id: h1ConfirmationId,
        };

        // Store
        const { rows } = await pool.query(
          `INSERT INTO entry_signals (symbol, direction, entry, sl, tp, rr, po3_phase, mss_level, fvg_stage, confluence, confidence,
           weekly_profile_id, h4_signal_id, h1_confirmation_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [entrySignal.symbol, entrySignal.direction, entrySignal.entry, entrySignal.sl, entrySignal.tp, entrySignal.rr,
           entrySignal.po3_phase, entrySignal.mss_level, entrySignal.fvg_stage, JSON.stringify(entrySignal.confluence),
           entrySignal.confidence, entrySignal.weekly_profile_id, entrySignal.h4_signal_id, entrySignal.h1_confirmation_id]
        );
        entrySignal.id = rows[0].id;
      }
    }

    res.json({
      status: 'ok',
      data: {
        ready,
        signal: entrySignal,
        po3Phase,
        mssFormed: !!mss,
        fvgStage2Available: fvgStage === 2,
        mss: mss || null,
        atrCompression: Math.round(atrCompression * 100) / 100,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PHASE 5: FUNDAMENTAL ENGINE
// ═══════════════════════════════════════════════════════════════

// ─── Market Regime ───────────────────────────────────────────
app.get('/api/fundamental/regime', async (req, res) => {
  try {
    const regime = await getMarketRegime(pool);
    res.json({ status: 'ok', data: regime });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Correlation Chains ───────────────────────────────────────
app.get('/api/fundamental/chains', async (req, res) => {
  try {
    const chains = await getCorrelationChains(pool);
    res.json({ status: 'ok', data: chains });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Impact Releases ─────────────────────────────────────────
app.get('/api/fundamental/impacts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20');
    const { rows } = await pool.query(`
      SELECT e.event_name as event, er.release_date as date, e.country,
             e.impact_tier as "impactTier", er.consensus, er.actual,
             er.previous, er.surprise_pct as "surprisePct", e.affected_symbols as "affectedSymbols"
      FROM event_releases er
      JOIN economic_events e ON e.id = er.event_id
      WHERE er.actual IS NOT NULL
      ORDER BY er.release_date DESC
      LIMIT $1
    `, [limit]);
    res.json({ status: 'ok', data: { releases: rows } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Weekly Map ──────────────────────────────────────────────
app.get('/api/fundamental/weekly-map', async (req, res) => {
  try {
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB (UTC+7)
    const dayOfWeek = now.getUTCDay() || 7;
    // Compute weekStart manually (getWeekStart expects number/string, not Date)
    const dayDow = now.getUTCDay();
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - ((dayDow + 6) % 7));
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Get events for this week
    const { rows: weekEvents } = await pool.query(`
      SELECT e.event_name, e.impact_tier, e.release_time_utc, e.country,
             er.release_date, e.correlation_chain
      FROM economic_events e
      LEFT JOIN event_releases er ON er.event_id = e.id
      WHERE er.release_date >= $1::date
      AND er.release_date < ($1::date + interval '7 days')
      ORDER BY er.release_date, e.release_time_utc
    `, [weekStartStr]);

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const result = days.map((day, i) => {
      const dayNum = i + 1;
      const profile = DAY_PROFILES[dayNum] || { type: 'unknown', fundamentalWeight: 0.5 };
      const dayDate = new Date(weekStartStr + 'T00:00:00Z');
      dayDate.setUTCDate(dayDate.getUTCDate() + i);
      const dateStr = dayDate.toISOString().split('T')[0];

      const dayEvents = weekEvents
        .filter(e => {
          if (!e.release_date) return false;
          const rd = e.release_date instanceof Date ? e.release_date.toISOString().split('T')[0] : String(e.release_date).split('T')[0];
          return rd === dateStr;
        })
        .map(e => ({
          name: e.event_name,
          time: e.release_time_utc,
          tier: e.impact_tier,
          country: e.country,
        }));

      return {
        day,
        type: profile.type,
        weight: profile.fundamentalWeight,
        isToday: dayNum === dayOfWeek,
        events: dayEvents,
      };
    });

    res.json({ status: 'ok', data: { days: result, week_start: weekStartStr } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Symbol Bias ─────────────────────────────────────────────
app.get('/api/fundamental/bias', async (req, res) => {
  try {
    const bias = await getSymbolBias(pool);
    res.json({ status: 'ok', data: bias });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── AI Narrative ────────────────────────────────────────────
app.get('/api/fundamental/narrative', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'XAUUSD').toUpperCase();
    const validSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'];
    if (!validSymbols.includes(symbol)) {
      return res.status(400).json({ error: `Invalid symbol. Use one of: ${validSymbols.join(', ')}` });
    }

    // Gather context
    const [regime, chains, biasResult] = await Promise.all([
      getMarketRegime(pool),
      getCorrelationChains(pool),
      getSymbolBias(pool),
    ]);

    const symbolBias = biasResult.symbols.find(s => s.symbol === symbol) || biasResult.symbols[0];

    const contextData = {
      symbol,
      regime: { regime: regime.regime, tone: regime.tone, usdStrength: regime.usdStrength, confidence: regime.confidence },
      chains: chains.chains.map(c => ({ name: c.name, trend: c.trend, status: c.status, prediction: c.prediction })),
      bias: symbolBias,
    };

    const systemPrompt = `You are a fundamental analysis expert. Given the market data, write a concise 3-paragraph analysis of the current fundamental landscape for ${symbol}. First paragraph: current regime and macro backdrop. Second paragraph: key correlations and chain status. Third paragraph: bias and what to watch.`;

    const mimoRes = await fetch(`${MIMO_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIMO_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Fundamental Data:\n${JSON.stringify(contextData, null, 2)}` },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        stream: false,
      }),
    });

    if (!mimoRes.ok) {
      const errText = await mimoRes.text();
      return res.status(502).json({ error: `AI API error: ${mimoRes.status}`, detail: errText });
    }

    const aiData = await mimoRes.json();
    const narrative = aiData.choices?.[0]?.message?.content || '';

    res.json({
      status: 'ok',
      data: {
        narrative,
        generated: new Date().toISOString(),
        symbol,
        context: contextData,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/fundamental-context/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB (UTC+7)
    const today = now.toISOString().split('T')[0];
    const dayOfWeek = now.getUTCDay() || 7; // 1=Mon..7=Sun
    const weekStart = getWeekStart(now);

    // 1. Check week_classifications
    let weekClass = null;
    const wcRes = await pool.query(
      'SELECT * FROM week_classifications WHERE week_start=$1', [weekStart]
    );
    if (wcRes.rows.length > 0) {
      weekClass = wcRes.rows[0];
    } else {
      // Compute from economic_events
      const events = await pool.query(
        `SELECT e.impact_tier, COUNT(*) as cnt
         FROM economic_events e
         WHERE EXISTS (
           SELECT 1 FROM event_releases er
           WHERE er.event_id = e.id
           AND er.release_date >= $1::date
           AND er.release_date < ($1::date + interval '7 days')
         )
         GROUP BY e.impact_tier`, [weekStart]
      );

      const tierCounts = {};
      for (const r of events.rows) tierCounts[r.impact_tier] = parseInt(r.cnt);

      let weekType = 'LOW_IMPACT';
      let volMult = 0.7;
      let maxPos = 5;
      let slWiden = 0.8;
      let entryRule = 'aggressive';
      let bestStrategy = 'mean_reversion';

      if ((tierCounts['S+'] || 0) >= 1 || (tierCounts['S'] || 0) >= 1) {
        weekType = 'HIGH_IMPACT'; volMult = 1.8; maxPos = 2; slWiden = 1.5;
        entryRule = 'event_only'; bestStrategy = 'event_breakout_or_fade';
      } else if ((tierCounts['A'] || 0) >= 1) {
        weekType = 'MEDIUM_IMPACT'; volMult = 1.3; maxPos = 3; slWiden = 1.2;
        entryRule = 'standard_with_caution'; bestStrategy = 'trend_following';
      } else if ((tierCounts['B'] || 0) >= 2 || (tierCounts['C'] || 0) >= 3) {
        weekType = 'LOW_MEDIUM_IMPACT'; volMult = 1.0; maxPos = 4; slWiden = 1.0;
        entryRule = 'standard'; bestStrategy = 'standard';
      }

      weekClass = { week_type: weekType, volatility_multiplier: volMult, max_positions: maxPos,
                     stop_loss_widen: slWiden, entry_rule: entryRule, best_strategy: bestStrategy,
                     tier_counts: tierCounts };
    }

    // 2. Day profile
    const dayProfile = DAY_PROFILES[dayOfWeek] || DAY_PROFILES[1];

    // 3. Upcoming events (next 48h)
    const upcomingRes = await pool.query(
      `SELECT e.event_name, e.impact_tier, e.release_time_utc, er.release_date, er.consensus, er.actual
       FROM economic_events e
       LEFT JOIN event_releases er ON er.event_id = e.id
       WHERE er.release_date >= $1::date
       AND er.release_date < ($1::date + interval '3 days')
       AND e.impact_tier IN ('S+', 'S', 'A', 'B')
       ORDER BY er.release_date, e.release_time_utc`, [today]
    );
    const upcomingEvents = upcomingRes.rows;

    // 4. Event proximity check
    const nearEvent = await isNearEvent(today, 30);

    // 5. Last event release surprise
    const lastReleaseRes = await pool.query(
      `SELECT er.surprise_pct, er.total_surprise, e.event_name, er.release_date
       FROM event_releases er
       JOIN economic_events e ON e.id = er.event_id
       WHERE er.release_date <= $1::date
       AND ($2 = ANY(e.affected_symbols) OR e.affected_symbols @> ARRAY[$2]::text[])
       ORDER BY er.release_date DESC LIMIT 1`, [today, symbol]
    );
    const lastRelease = lastReleaseRes.rows.length > 0 ? lastReleaseRes.rows[0] : null;

    // 6. Calculate bias score
    let biasScore = dayProfile.fundamentalWeight;
    biasScore *= weekClass.volatility_multiplier || 1.0;

    if (nearEvent) {
      return res.json({
        status: 'ok',
        data: {
          symbol, bias: 'neutral', score: 0, day_type: dayProfile.type,
          day_fundamental_weight: dayProfile.fundamentalWeight,
          upcoming_events: upcomingEvents, event_proximity: true,
          reason: 'Within 30min of high-impact event — no entry',
          week_type: weekClass,
        },
      });
    }

    if (lastRelease && lastRelease.surprise_pct) {
      const surprise = parseFloat(lastRelease.surprise_pct);
      if (surprise > 0.1) biasScore += 0.3;
      else if (surprise < -0.1) biasScore -= 0.3;
    }

    // Direction based on symbol
    let bias = 'neutral';
    const threshold = 0.3;
    if (['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'].includes(symbol)) {
      bias = biasScore > threshold ? 'bullish' : biasScore < -threshold ? 'bearish' : 'neutral';
    } else if (symbol === 'USDJPY') {
      bias = biasScore > threshold ? 'bullish' : biasScore < -threshold ? 'bearish' : 'neutral';
    }

    // Store
    await pool.query(
      `INSERT INTO fundamental_bias (symbol, bias_date, bias, score, day_type, day_fundamental_weight, upcoming_events, event_proximity, last_surprise, last_surprise_direction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (symbol, bias_date) DO UPDATE SET bias=$3, score=$4, day_type=$5, day_fundamental_weight=$6, upcoming_events=$7, event_proximity=$8, last_surprise=$9, last_surprise_direction=$10`,
      [symbol, today, bias, Math.round(biasScore * 100) / 100, dayProfile.type, dayProfile.fundamentalWeight,
       JSON.stringify(upcomingEvents.map(e => e.event_name)), false,
       lastRelease ? lastRelease.surprise_pct : null,
       lastRelease && lastRelease.surprise_pct > 0 ? 'positive' : 'negative']
    );

    res.json({
      status: 'ok',
      data: {
        symbol, bias, score: Math.round(biasScore * 100) / 100,
        day_type: dayProfile.type, day_fundamental_weight: dayProfile.fundamentalWeight,
        upcoming_events: upcomingEvents, event_proximity: false,
        last_surprise: lastRelease ? { event: lastRelease.event_name, surprise: lastRelease.surprise_pct, date: lastRelease.release_date } : null,
        week_type: weekClass,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Economic calendar for a given week
app.get('/api/economic-calendar/:week', async (req, res) => {
  try {
    const week = req.params.week; // YYYY-MM-DD format (any day in the week)
    const weekStart = getWeekStart(week);
    const { rows } = await pool.query(
      `SELECT e.*, er.release_date, er.consensus, er.previous, er.actual, er.surprise_pct
       FROM economic_events e
       LEFT JOIN event_releases er ON er.event_id = e.id
       WHERE er.release_date >= $1::date
       AND er.release_date < ($1::date + interval '7 days')
       ORDER BY er.release_date, e.release_time_utc`, [weekStart]
    );
    res.json({ status: 'ok', data: rows, week_start: weekStart });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// PHASE 6: MACRO DASHBOARD
// ═══════════════════════════════════════════════════════════════

app.get("/api/macro/latest", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.indicator, i.label, i.category, i.unit,
             v.value, v.prev_value as "prevValue", v.change_pct as "changePct", v.date
      FROM macro_indicators i
      LEFT JOIN LATERAL (
        SELECT value, prev_value, change_pct, date
        FROM macro_values WHERE indicator_id = i.id
        ORDER BY date DESC LIMIT 1
      ) v ON true
      WHERE i.enabled = true
      ORDER BY i.display_order
    `);
    res.json({ status: "ok", data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/macro/sparkline", async (req, res) => {
  try {
    const { indicator } = req.query;
    const range = req.query.range || "1y";
    const rangeDays = { "3m": 90, "6m": 180, "1y": 365, "2y": 730, "5y": 1825 };
    const days = rangeDays[range] || 365;
    const indRes = await pool.query("SELECT id, indicator, label, unit FROM macro_indicators WHERE indicator = $1", [indicator]);
    if (indRes.rows.length === 0) return res.status(404).json({ error: "Unknown indicator" });
    const ind = indRes.rows[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const { rows } = await pool.query(
      "SELECT date, value FROM macro_values WHERE indicator_id = $1 AND date >= $2 ORDER BY date ASC",
      [ind.id, cutoff.toISOString().split("T")[0]]
    );
    res.json({ status: "ok", data: { indicator: ind.indicator, label: ind.label, unit: ind.unit, series: rows } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/macro/history", async (req, res) => {
  try {
    const { indicator } = req.query;
    const limit = parseInt(req.query.limit || "100");
    const indRes = await pool.query("SELECT id, indicator, label, unit FROM macro_indicators WHERE indicator = $1", [indicator]);
    if (indRes.rows.length === 0) return res.status(404).json({ error: "Unknown indicator" });
    const ind = indRes.rows[0];
    const { rows } = await pool.query(
      "SELECT date, value, prev_value as \"prevValue\", change_pct as \"changePct\" FROM macro_values WHERE indicator_id = $1 ORDER BY date DESC LIMIT $2",
      [ind.id, limit]
    );
    res.json({ status: "ok", data: { indicator: ind.indicator, label: ind.label, unit: ind.unit, records: rows } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/macro/config", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT indicator, label, category, unit, enabled, display_order as \"displayOrder\" FROM macro_indicators ORDER BY display_order"
    );
    res.json({ status: "ok", data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PHASE 7: SMT ENGINE
// ═══════════════════════════════════════════════════════════════
app.get('/api/smt/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Find relevant SMT pair
    const smtPair = SMT_PAIRS.find(p => p.pair1 === symbol || p.pair2 === symbol);
    if (!smtPair) {
      return res.json({ status: 'ok', data: { signals: [], message: 'No SMT pair mapping for ' + symbol } });
    }

    // Fetch H4 candles for both pairs
    const p1 = await pool.query(
      `SELECT * FROM historical_ohlc WHERE symbol=$1 AND timeframe='H4' ORDER BY timestamp DESC LIMIT 10`, [smtPair.pair1]
    );
    const p2 = await pool.query(
      `SELECT * FROM historical_ohlc WHERE symbol=$1 AND timeframe='H4' ORDER BY timestamp DESC LIMIT 10`, [smtPair.pair2]
    );

    if (p1.rows.length < 3 || p2.rows.length < 3) {
      return res.json({ status: 'ok', data: { signals: [] } });
    }

    const p1Candles = p1.rows.reverse();
    const p2Candles = p2.rows.reverse();

    const signals = [];

    // SMT Detection: check last few candles for divergence
    for (let i = 2; i < Math.min(p1Candles.length, p2Candles.length); i++) {
      const p1SweptHigh = p1Candles[i].high > p1Candles[i - 1].high && p1Candles[i].high > p1Candles[i - 2].high;
      const p2SweptHigh = p2Candles[i].high > p2Candles[i - 1].high && p2Candles[i].high > p2Candles[i - 2].high;
      const p1SweptLow = p1Candles[i].low < p1Candles[i - 1].low && p1Candles[i].low < p1Candles[i - 2].low;
      const p2SweptLow = p2Candles[i].low < p2Candles[i - 1].low && p2Candles[i].low < p2Candles[i - 2].low;

      if (smtPair.correlation === 'inverse') {
        // Inverse pair (XAUUSD vs USDJPY): one sweeps high but other fails = divergence
        if (p1SweptHigh && !p2SweptHigh) {
          signals.push({
            pair1: smtPair.pair1, pair2: smtPair.pair2,
            type: 'bearish_smt',
            description: `${smtPair.pair1} swept high but ${smtPair.pair2} failed — bearish SMT`,
            confidence: 65,
            timestamp: p1Candles[i].timestamp,
          });
        }
        if (!p1SweptHigh && p2SweptHigh) {
          signals.push({
            pair1: smtPair.pair1, pair2: smtPair.pair2,
            type: 'bullish_smt',
            description: `${smtPair.pair2} swept high but ${smtPair.pair1} failed — bullish SMT`,
            confidence: 65,
            timestamp: p2Candles[i].timestamp,
          });
        }
      } else {
        // Positive pair (EURUSD vs GBPUSD): one sweeps high but other fails = divergence
        if (p1SweptHigh && !p2SweptHigh) {
          signals.push({
            pair1: smtPair.pair1, pair2: smtPair.pair2,
            type: 'bearish_smt',
            description: `${smtPair.pair1} swept high but ${smtPair.pair2} failed — bearish divergence`,
            confidence: 60,
            timestamp: p1Candles[i].timestamp,
          });
        }
        if (!p1SweptHigh && p2SweptHigh) {
          signals.push({
            pair1: smtPair.pair1, pair2: smtPair.pair2,
            type: 'bullish_smt',
            description: `${smtPair.pair2} swept high but ${smtPair.pair1} failed — bullish divergence`,
            confidence: 60,
            timestamp: p2Candles[i].timestamp,
          });
        }
      }

      // Low sweep divergence
      if (p1SweptLow && !p2SweptLow) {
        signals.push({
          pair1: smtPair.pair1, pair2: smtPair.pair2,
          type: 'bullish_smt',
          description: `${smtPair.pair1} swept low but ${smtPair.pair2} failed — bullish SMT`,
          confidence: 60,
          timestamp: p1Candles[i].timestamp,
        });
      }
      if (!p1SweptLow && p2SweptLow) {
        signals.push({
          pair1: smtPair.pair1, pair2: smtPair.pair2,
          type: 'bearish_smt',
          description: `${smtPair.pair2} swept low but ${smtPair.pair1} failed — bearish SMT`,
          confidence: 60,
          timestamp: p2Candles[i].timestamp,
        });
      }
    }

    // Store recent signals
    const storedSignals = [];
    for (const sig of signals.slice(-3)) {
      const { rows } = await pool.query(
        `INSERT INTO smt_signals (pair1, pair2, type, description, confidence)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [sig.pair1, sig.pair2, sig.type, sig.description, sig.confidence]
      );
      storedSignals.push(rows[0]);
    }

    // Also store correlation snapshot
    const p1Returns = [];
    const p2Returns = [];
    for (let i = 1; i < Math.min(p1Candles.length, p2Candles.length); i++) {
      p1Returns.push((p1Candles[i].close - p1Candles[i - 1].close) / p1Candles[i - 1].close);
      p2Returns.push((p2Candles[i].close - p2Candles[i - 1].close) / p2Candles[i - 1].close);
    }

    let correlation = 0;
    if (p1Returns.length > 2) {
      const mean1 = p1Returns.reduce((a, b) => a + b, 0) / p1Returns.length;
      const mean2 = p2Returns.reduce((a, b) => a + b, 0) / p2Returns.length;
      let cov = 0, var1 = 0, var2 = 0;
      for (let i = 0; i < p1Returns.length; i++) {
        cov += (p1Returns[i] - mean1) * (p2Returns[i] - mean2);
        var1 += (p1Returns[i] - mean1) ** 2;
        var2 += (p2Returns[i] - mean2) ** 2;
      }
      correlation = var1 && var2 ? cov / Math.sqrt(var1 * var2) : 0;
    }

    const regime = Math.abs(correlation) > 0.6 ? 'strong' : Math.abs(correlation) > 0.3 ? 'moderate' : 'weak';
    await pool.query(
      `INSERT INTO correlation_snapshots (snapshot_time, pair1, pair2, correlation, regime, lookback_hours)
       VALUES (NOW(), $1, $2, $3, $4, 40)`,
      [smtPair.pair1, smtPair.pair2, Math.round(correlation * 1000) / 1000, regime]
    );

    res.json({
      status: 'ok',
      data: {
        signals: storedSignals.length > 0 ? storedSignals : signals,
        correlation: Math.round(correlation * 1000) / 1000,
        regime,
        pair: smtPair,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PHASE 8: UNIFIED SIGNAL GENERATOR
// ═══════════════════════════════════════════════════════════════

app.get('/api/unified-signal/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB (UTC+7)
    const dayOfWeek = now.getUTCDay() || 7;

    // Day filter: no Monday, no NFP Friday
    const isMonday = dayOfWeek === 1;
    const isFriday = dayOfWeek === 5;

    // Check for NFP week (first Friday of month)
    let isNFPWeek = false;
    if (isFriday) {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstFriday = new Date(firstOfMonth);
      while (firstFriday.getUTCDay() !== 5) firstFriday.setUTCDate(firstFriday.getUTCDate() + 1);
      if (now.getUTCDate() <= firstFriday.getUTCDate() + 1) isNFPWeek = true;
    }

    // Event proximity check
    const today = now.toISOString().split('T')[0];
    let nearEvent = false;
    // Filter reasons (applied after layer fetch)
    const filterReasons = [];
    if (dayOfWeek === 1) filterReasons.push("Monday — no entries");
    if (isFriday && isNFPWeek) filterReasons.push("NFP Friday — no entries");
    if (nearEvent) filterReasons.push("Within 30min of high-impact event");
    try { nearEvent = await isNearEvent(today, 30); } catch(e) {}

    // ═══ REAL-TIME: Fetch candles from MT5 Feed API ═══
    const [h4Candles, h1Candles, m15Candles] = await Promise.all([
      fetchMT5Candles(symbol, 'H4', 30),
      fetchMT5Candles(symbol, 'H1', 30),
      fetchMT5Candles(symbol, 'M15', 40),
    ]);

    // Determine active killzone
    const utcHour = now.getUTCHours();
    let activeKillzone = null;
    for (const kz of KILLZONES) {
      const kzHour = parseInt(kz.h4Time.split(':')[0]);
      if (utcHour >= kzHour && utcHour < kzHour + 4) { activeKillzone = kz; break; }
    }

    // Run H4 model detection on real-time candles
    const h4Signals = h4Candles.length >= 5 ? detectH4Signals(h4Candles, activeKillzone) : [];
    const latestH4 = h4Signals.length > 0 ? h4Signals[h4Signals.length - 1] : null;

    // Run H1 confirmation on real-time candles (if H4 signal exists)
    let h1Confirm = { confirmed: false };
    if (latestH4) {
      const h4Time = latestH4.h4_candle_time;
      const h1ForH4 = h1Candles.filter(c => c.timestamp >= h4Time && c.timestamp < h4Time + 14400);
      h1Confirm = confirmH1(latestH4, h1ForH4);
    }

    // Run M15 entry engine on real-time candles
    const m15Result = detectM15Entry(m15Candles, latestH4?.bias || null);
    const entry = m15Result.ready && m15Result.entrySignal ? m15Result.entrySignal : null;

    // Run SMT divergence detection (real-time from MT5)
    let smtResult = null;
    const smtPair = SMT_PAIRS.find(p => p.pair1 === symbol || p.pair2 === symbol);
    if (smtPair) {
      const [smtP1, smtP2] = await Promise.all([
        fetchMT5Candles(smtPair.pair1, 'H4', 10),
        fetchMT5Candles(smtPair.pair2, 'H4', 10),
      ]);
      smtResult = detectSMT(smtP1, smtP2, smtPair);
    }

    // DB layers (weekly profile, fundamental)
    const [wpRes, fundRes] = await Promise.all([
      pool.query('SELECT * FROM weekly_profiles WHERE symbol=$1 ORDER BY week_start DESC LIMIT 1', [symbol]),
      pool.query('SELECT * FROM fundamental_bias WHERE symbol=$1 ORDER BY bias_date DESC LIMIT 1', [symbol]),
    ]);

    const wp = wpRes.rows[0] || null;
    const fund = fundRes.rows[0] || null;

    // Build layer objects matching old format
    const h4 = latestH4 ? { bias: latestH4.bias, confidence: latestH4.confidence, model: latestH4.model } : null;
    const h1 = h1Confirm.confirmed !== undefined ? { confirmation_type: h1Confirm.confirmationType, confirmed: h1Confirm.confirmed, confidence: h1Confirm.confidence, ohol_type: h1Confirm.oholType } : null;

    // Layer scores (0-100)
    const layer1Score = wp ? (wp.confidence || 50) : 30;
    const layer2Score = h4 ? (h4.confidence || 50) : 30;
    const layer3Score = h1 ? (h1.confidence || 50) : 30;
    const layer4Score = entry ? (entry.confidence || 50) : 30;
    const fundamentalScore = fund ? Math.min(100, Math.abs(parseFloat(fund.score) || 0) * 30) : 20;
    const smtScore = smtResult ? smtResult.confidence : 20;

    // Weighted confidence
    const totalConfidence = Math.round(
      (layer1Score * 0.25) +
      (layer2Score * 0.20) +
      (layer3Score * 0.15) +
      (layer4Score * 0.20) +
      (fundamentalScore * 0.10) +
      (smtScore * 0.10)
    );

    // Determine direction from layers
    let direction = 'neutral';
    const biasVotes = [];
    if (wp && wp.bias) biasVotes.push(wp.bias);
    if (h4 && h4.bias) biasVotes.push(h4.bias);
    if (h1 && h1.confirmation_type) biasVotes.push(h1.confirmation_type === 'reversal' ? (wp?.bias === 'bullish' ? 'bearish' : 'bullish') : wp?.bias || 'neutral');
    if (entry && entry.direction) biasVotes.push(entry.direction === 'long' ? 'bullish' : 'bearish');
    if (fund && fund.bias) biasVotes.push(fund.bias);
    if (smtResult && smtResult.type) biasVotes.push(smtResult.type.includes('bullish') ? 'bullish' : 'bearish');

    const bullVotes = biasVotes.filter(b => b === 'bullish').length;
    const bearVotes = biasVotes.filter(b => b === 'bearish').length;
    if (bullVotes > bearVotes) direction = 'bullish';
    else if (bearVotes > bullVotes) direction = 'bearish';

    // Minimum threshold: 65%
    const generated = filterReasons.length === 0 && totalConfidence >= 65 && entry && entry.rr >= 2;

    // Fundamental alignment check
    let fundamentalAligned = true;
    if (fund && fund.bias && fund.bias !== 'neutral' && direction !== 'neutral') {
      fundamentalAligned = fund.bias === direction;
    }

    const reason = [...filterReasons];
    if (totalConfidence < 65) reason.push(`Confidence ${totalConfidence}% below 65% threshold`);
    if (!entry) reason.push('No entry signal available');
    if (entry && entry.rr < 2) reason.push(`R:R ${entry.rr} below 2R minimum`);
    if (!fundamentalAligned) reason.push('Fundamental bias misaligned');

    // Store unified signal
    let storedSignal = null;
    if (generated && fundamentalAligned) {
      const weekType = weekClass ? weekClass.week_type || 'LOW_IMPACT' : 'LOW_IMPACT';
      const maxPos = weekClass ? weekClass.max_positions || 5 : 5;
      const slAdj = weekClass ? weekClass.stop_loss_widen || 1.0 : 1.0;

      const { rows } = await pool.query(
        `INSERT INTO unified_signals (
           symbol, direction, entry_price, stop_loss, take_profit, rr_ratio,
           layer1_score, layer2_score, layer3_score, layer4_score,
           fundamental_score, smt_score, total_confidence,
           confluence_factors, week_type, event_proximity, fundamental_bias,
           max_positions, stop_adjustment, is_news_trade, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [symbol, direction,
         entry ? entry.entry : null, entry ? entry.sl : null, entry ? entry.tp : null, entry ? entry.rr : null,
         layer1Score, layer2Score, layer3Score, layer4Score,
         fundamentalScore, smtScore, totalConfidence,
         JSON.stringify(entry ? entry.confluence || [] : []),
         weekType, false, fund ? fund.bias : null,
         maxPos, slAdj, false, 'active']
      );
      storedSignal = rows[0];
    }

    res.json({
      status: 'ok',
      data: {
        generated,
        signal: storedSignal,
        direction,
        confidence: totalConfidence,
        threshold: 65,
        breakdown: {
          weeklyProfile: wp ? { bias: wp.bias, model: wp.model, confidence: wp.confidence, score: wp.confidence || 50 } : null,
          h4Signal: h4 ? { modelNumber: h4.model, bias: h4.bias, killzone: activeKillzone?.name || '—', confidence: h4.confidence, score: h4.confidence || 50, source: 'mt5_realtime', totalSignals: h4Signals.length } : null,
          h1Confirm: { confirmed: h1 ? h1.confirmed : false, type: h1 ? h1.confirmation_type : '—', ohStatus: h1 ? (h1.ohol_type || '—') : '—', olStatus: h1 ? (h1.oholFormed ? 'formed' : '—') : '—', confidence: h1 ? h1.confidence : 0, score: h1 ? (h1.confidence || 0) : 0, source: 'mt5_realtime' },
          m15Entry: { po3Phase: m15Result.po3Phase || '—', mss: m15Result.mss ? true : false, fvgStage: m15Result.fvgStage || 0, score: m15Result.confidence || 0, source: 'mt5_realtime' },
          fundamental: fund ? { bias: fund.bias, score: Math.abs(parseFloat(fund.score) || 0) * 10, weekType: fund.day_type || '—', eventProximity: fund.event_proximity || false } : null,
          smt: smtResult ? { score: smtResult.confidence || 0, type: smtResult.type, source: 'mt5_realtime' } : null,
        },
        fundamental_aligned: fundamentalAligned,
        reasons: reason,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Week type endpoint
app.get('/api/week-type', async (req, res) => {
  try {
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB (UTC+7)
    const weekStart = getWeekStart(now);
    const today = now.toISOString().split('T')[0];

    // Check stored classification
    const wcRes = await pool.query('SELECT * FROM week_classifications WHERE week_start=$1', [weekStart]);
    if (wcRes.rows.length > 0) {
      return res.json({ status: 'ok', data: wcRes.rows[0] });
    }

    // Compute from events
    const events = await pool.query(
      `SELECT e.impact_tier, COUNT(*) as cnt
       FROM economic_events e
       JOIN event_releases er ON er.event_id = e.id
       WHERE er.release_date >= $1::date AND er.release_date < ($1::date + interval '7 days')
       GROUP BY e.impact_tier`, [weekStart]
    );

    const tierCounts = {};
    for (const r of events.rows) tierCounts[r.impact_tier] = parseInt(r.cnt);

    let weekType = 'LOW_IMPACT';
    let volMult = 0.7;
    let maxPos = 5;
    let slWiden = 0.8;
    let entryRule = 'aggressive';
    let bestStrategy = 'mean_reversion';

    if ((tierCounts['S+'] || 0) >= 1 || (tierCounts['S'] || 0) >= 1) {
      weekType = 'HIGH_IMPACT'; volMult = 1.8; maxPos = 2; slWiden = 1.5;
      entryRule = 'event_only'; bestStrategy = 'event_breakout_or_fade';
    } else if ((tierCounts['A'] || 0) >= 1) {
      weekType = 'MEDIUM_IMPACT'; volMult = 1.3; maxPos = 3; slWiden = 1.2;
      entryRule = 'standard_with_caution'; bestStrategy = 'trend_following';
    } else if ((tierCounts['B'] || 0) >= 2 || (tierCounts['C'] || 0) >= 3) {
      weekType = 'LOW_MEDIUM_IMPACT'; volMult = 1.0; maxPos = 4; slWiden = 1.0;
      entryRule = 'standard'; bestStrategy = 'standard';
    }

    // Get upcoming events for display
    const upcomingRes = await pool.query(
      `SELECT e.event_name, e.impact_tier, er.release_date, e.release_time_utc
       FROM economic_events e
       JOIN event_releases er ON er.event_id = e.id
       WHERE er.release_date >= $1::date AND er.release_date < ($1::date + interval '7 days')
       ORDER BY er.release_date, e.release_time_utc`, [weekStart]
    );

    const result = {
      week_start: weekStart,
      week_type: weekType,
      volatility_multiplier: volMult,
      max_positions: maxPos,
      stop_loss_widen: slWiden,
      entry_rule: entryRule,
      best_strategy: bestStrategy,
      tier_counts: tierCounts,
      upcoming_events: upcomingRes.rows,
    };

    // Store
    await pool.query(
      `INSERT INTO week_classifications (week_start, week_type, volatility_multiplier, max_positions, stop_loss_widen, entry_rule, best_strategy, tier_counts, upcoming_events)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (week_start) DO UPDATE SET week_type=$2, volatility_multiplier=$3, max_positions=$4, stop_loss_widen=$5, entry_rule=$6, best_strategy=$7, tier_counts=$8, upcoming_events=$9`,
      [weekStart, weekType, volMult, maxPos, slWiden, entryRule, bestStrategy,
       JSON.stringify(tierCounts), JSON.stringify(upcomingRes.rows.map(e => e.event_name))]
    );

    res.json({ status: 'ok', data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// HISTORY ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.get('/api/signals/history/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const limit = parseInt(req.query.limit || '50');
    const { rows } = await pool.query(
      'SELECT * FROM unified_signals WHERE symbol=$1 ORDER BY created_at DESC LIMIT $2',
      [symbol, limit]
    );
    res.json({ status: 'ok', data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/signals/history/:symbol/stats', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const statsRes = await pool.query(
      `SELECT
         COUNT(*) as total_signals,
         COUNT(*) FILTER (WHERE direction = 'bullish') as bullish_count,
         COUNT(*) FILTER (WHERE direction = 'bearish') as bearish_count,
         AVG(total_confidence) as avg_confidence,
         AVG(layer1_score) as avg_layer1,
         AVG(layer2_score) as avg_layer2,
         AVG(layer3_score) as avg_layer3,
         AVG(layer4_score) as avg_layer4,
         AVG(fundamental_score) as avg_fundamental,
         AVG(smt_score) as avg_smt
       FROM unified_signals WHERE symbol=$1`, [symbol]
    );

    // Get entry results for win rate
    const entryStats = await pool.query(
      `SELECT
         COUNT(*) as total_entries,
         COUNT(*) FILTER (WHERE result='win') as wins,
         COUNT(*) FILTER (WHERE result='loss') as losses,
         AVG(rr) as avg_rr
       FROM entry_signals WHERE symbol=$1 AND result IN ('win','loss')`, [symbol]
    );

    const s = statsRes.rows[0];
    const e = entryStats.rows[0];
    const totalEntries = parseInt(e.total_entries) || 0;
    const wins = parseInt(e.wins) || 0;

    res.json({
      status: 'ok',
      data: {
        symbol,
        total_signals: parseInt(s.total_signals) || 0,
        bullish_count: parseInt(s.bullish_count) || 0,
        bearish_count: parseInt(s.bearish_count) || 0,
        avg_confidence: s.avg_confidence ? Math.round(parseFloat(s.avg_confidence) * 10) / 10 : 0,
        layer_averages: {
          weekly_profile: s.avg_layer1 ? Math.round(parseFloat(s.avg_layer1) * 10) / 10 : 0,
          h4_signal: s.avg_layer2 ? Math.round(parseFloat(s.avg_layer2) * 10) / 10 : 0,
          h1_confirmation: s.avg_layer3 ? Math.round(parseFloat(s.avg_layer3) * 10) / 10 : 0,
          entry: s.avg_layer4 ? Math.round(parseFloat(s.avg_layer4) * 10) / 10 : 0,
          fundamental: s.avg_fundamental ? Math.round(parseFloat(s.avg_fundamental) * 10) / 10 : 0,
          smt: s.avg_smt ? Math.round(parseFloat(s.avg_smt) * 10) / 10 : 0,
        },
        win_rate: totalEntries > 0 ? Math.round((wins / totalEntries) * 1000) / 10 : 0,
        avg_rr: e.avg_rr ? Math.round(parseFloat(e.avg_rr) * 100) / 100 : 0,
        total_entries: totalEntries,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// HEALTH & UTILITY
// ═══════════════════════════════════════════════════════════════

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    // Check table counts
    const tables = ['historical_ohlc', 'weekly_profiles', 'h4_signals', 'h1_confirmations',
                     'entry_signals', 'smt_signals', 'strategy_performance', 'economic_events',
                     'event_releases', 'week_classifications', 'fundamental_bias', 'unified_signals',
                     'correlation_snapshots'];
    const counts = {};
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*) as cnt FROM ${t}`);
      counts[t] = parseInt(r.rows[0].cnt);
    }
    res.json({ status: 'ok', db: 'connected', tables: counts, uptime: process.uptime() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.post('/api/query', async (req, res) => {
  try {
    const { sql, params } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL query required' });
    // Block dangerous statements
    const upper = sql.toUpperCase().trim();
    if (upper.startsWith('DROP') || upper.startsWith('TRUNCATE') || upper.startsWith('DELETE') || upper.startsWith('UPDATE')) {
      return res.status(403).json({ error: 'Write operations blocked via /api/query' });
    }
    const { rows } = await pool.query(sql, params || []);
    res.json({ status: 'ok', data: rows, count: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

const PORT = 3001;
// ═══════════════════════════════════════════════════════════════
// WEEKLY OUTLOOK — Context aggregation + AI narrative
// ═══════════════════════════════════════════════════════════════

const MIMO_BASE = 'https://9router.amuharr.com/v1';
const MIMO_KEY = process.env.MIMO_API_KEY || 'sk-e654a4de10dd8e99-qyz273-28986eae';
const MIMO_MODEL = 'mimo/mimo-v2.5';

app.get('/api/context/weekly/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB (UTC+7)
    const dayOfWeek = now.getUTCDay();
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
    monday.setUTCHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().split('T')[0];

    const [wpRes, fcRes, smtRes, calRes] = await Promise.all([
      pool.query('SELECT * FROM weekly_profiles WHERE symbol = $1 ORDER BY week_start DESC LIMIT 1', [symbol]),
      pool.query('SELECT * FROM fundamental_bias WHERE symbol = $1 ORDER BY bias_date DESC LIMIT 1', [symbol]),
      pool.query('SELECT * FROM smt_signals WHERE (pair1 = $1 OR pair2 = $1) ORDER BY created_at DESC LIMIT 3', [symbol]),
      pool.query('SELECT * FROM week_classifications ORDER BY week_start DESC LIMIT 1'),
    ]);

    const [eventsRes, releasesRes] = await Promise.all([
      pool.query(`SELECT ee.*, er.consensus as forecast, er.previous as prev_value FROM economic_events ee LEFT JOIN LATERAL (SELECT consensus, previous FROM event_releases WHERE event_id = ee.id ORDER BY release_date DESC LIMIT 1) er ON true WHERE $1 = ANY(ee.affected_symbols) ORDER BY ee.release_day, ee.release_time_utc`, [symbol]),
      pool.query(`SELECT er.*, ee.event_name, ee.impact_tier FROM event_releases er JOIN economic_events ee ON er.event_id = ee.id WHERE er.actual IS NOT NULL ORDER BY er.release_date DESC LIMIT 10`),
    ]);

    const wp = wpRes.rows[0] || null;
    const fc = fcRes.rows[0] || null;
    const wc = calRes.rows[0] || null;
    const smt = smtRes.rows;
    const events = eventsRes.rows;
    const releases = releasesRes.rows;

    // Day rankings
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const dayTypes = {
      monday: 'manipulation', tuesday: 'continuation', wednesday: 'reversal',
      thursday: 'expansion', friday: 'distribution'
    };
    const dayWeights = { monday: 0.3, tuesday: 0.8, wednesday: 1.2, thursday: 0.9, friday: 1.5 };
    const today = dayNames[dayOfWeek - 1] || 'monday';

    const context = {
      symbol,
      weeklyProfile: wp ? {
        model: wp.model, bias: wp.bias, sequence: wp.sequence,
        confidence: wp.confidence, weekHigh: wp.high, weekLow: wp.low,
        dayRankings: wp.day_rankings,
      } : null,
      fundamental: fc ? {
        bias: fc.bias, score: Number(fc.score), dayType: fc.day_type,
        eventProximity: fc.event_proximity, lastSurprise: fc.last_surprise,
      } : null,
      weekType: wc ? {
        type: wc.week_type, volatilityMultiplier: Number(wc.volatility_multiplier),
        maxPositions: wc.max_positions, strategy: wc.best_strategy,
      } : null,
      smtSignals: smt.map(s => ({
        pair1: s.pair1, pair2: s.pair2, type: s.type,
        description: s.description, confidence: s.confidence,
      })),
      economicEvents: (() => {
        const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
        const todayDow = now.getUTCDay();
        const thisMonday = new Date(now);
        thisMonday.setUTCDate(now.getUTCDate() - ((todayDow + 6) % 7));
        thisMonday.setUTCHours(0, 0, 0, 0);
        const nextMonday = new Date(thisMonday);
        nextMonday.setUTCDate(thisMonday.getUTCDate() + 7);
        return events.map(e => {
          const dow = dayMap[e.release_day] ?? 1;
          const thisWeekDate = new Date(thisMonday);
          thisWeekDate.setUTCDate(thisMonday.getUTCDate() + (dow - 1));
          const nextWeekDate = new Date(nextMonday);
          nextWeekDate.setUTCDate(nextMonday.getUTCDate() + (dow - 1));
          return {
            name: e.event_name, country: e.country, tier: e.impact_tier,
            impact: e.impact_tier === 'S+' ? 'HIGH' : e.impact_tier === 'S' ? 'HIGH'
              : e.impact_tier === 'A' ? 'MEDIUM' : 'LOW',
            day: e.release_day, time: e.release_time_utc, chain: e.correlation_chain,
            forecast: e.forecast, previous: e.prev_value,
            thisWeekDate: thisWeekDate.toISOString().split('T')[0],
            nextWeekDate: nextWeekDate.toISOString().split('T')[0],
            week: thisWeekDate < now && dow < todayDow ? 'passed' : 'this',
          };
        });
      })(),
      recentReleases: releases.map(r => ({
        event: r.event_name, actual: r.actual, consensus: r.consensus,
        surprise: r.surprise_pct, date: r.release_date,
      })),
      today, dayType: dayTypes[today], dayWeight: dayWeights[today],
      currentTime: now.toISOString(),
    };

    res.json({ status: 'ok', data: context });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/context/daily/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB (UTC+7)
    const todayStr = now.toISOString().split('T')[0];
    const dayOfWeek = now.getUTCDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayTypes = {
      monday: 'manipulation', tuesday: 'continuation', wednesday: 'reversal',
      thursday: 'expansion', friday: 'distribution'
    };

    const [fcRes, wpRes, smtRes, entriesRes] = await Promise.all([
      pool.query('SELECT * FROM fundamental_bias WHERE symbol = $1 ORDER BY bias_date DESC LIMIT 1', [symbol]),
      pool.query('SELECT * FROM weekly_profiles WHERE symbol = $1 ORDER BY week_start DESC LIMIT 1', [symbol]),
      pool.query('SELECT * FROM smt_signals WHERE (pair1 = $1 OR pair2 = $1) ORDER BY created_at DESC LIMIT 5', [symbol]),
      pool.query('SELECT * FROM unified_signals WHERE symbol = $1 ORDER BY created_at DESC LIMIT 10', [symbol]),
    ]);

    const [todayEvents, recentReleases] = await Promise.all([
      pool.query(`SELECT ee.*, er.consensus as forecast, er.previous as prev_value FROM economic_events ee LEFT JOIN LATERAL (SELECT consensus, previous FROM event_releases WHERE event_id = ee.id ORDER BY release_date DESC LIMIT 1) er ON true WHERE $1 = ANY(ee.affected_symbols) ORDER BY ee.release_day, ee.release_time_utc`, [symbol]),
      pool.query(`SELECT er.*, ee.event_name, ee.impact_tier FROM event_releases er JOIN economic_events ee ON er.event_id = ee.id WHERE er.actual IS NOT NULL AND ee.event_name = ANY(SELECT event_name FROM economic_events WHERE $1 = ANY(affected_symbols)) ORDER BY er.release_date DESC LIMIT 10`, [symbol]),
    ]);

    // Get real-time H4 and H1 candles from MT5 Feed API
    const [h4CandlesRaw, h1CandlesRaw] = await Promise.all([
      fetchMT5Candles(symbol, 'H4', 12),
      fetchMT5Candles(symbol, 'H1', 8),
    ]);

    const fc = fcRes.rows[0] || null;
    const wp = wpRes.rows[0] || null;

    const context = {
      symbol,
      date: todayStr,
      dayOfWeek: dayNames[dayOfWeek],
      dayType: dayTypes[dayNames[dayOfWeek]] || 'unknown',
      fundamental: fc ? {
        bias: fc.bias, score: Number(fc.score), dayType: fc.day_type,
        eventProximity: fc.event_proximity, lastSurprise: fc.last_surprise,
        lastSurpriseDirection: fc.last_surprise_direction,
      } : null,
      weeklyProfile: wp ? {
        model: wp.model, bias: wp.bias, confidence: wp.confidence,
        weekHigh: wp.high, weekLow: wp.low,
      } : null,
      todayEvents: (() => {
        const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
        const todayDow = dayOfWeek;
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monday = new Date(now);
        monday.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
        monday.setUTCHours(0, 0, 0, 0);
        return todayEvents.rows.map(e => {
          const dow = dayMap[e.release_day] ?? 1;
          const eventDate = new Date(monday);
          eventDate.setUTCDate(monday.getUTCDate() + (dow - 1));
          const isToday = dow === todayDow;
          const isUpcoming = dow > todayDow;
          const dayDiff = dow - todayDow;
          return {
            name: e.event_name, tier: e.impact_tier, time: e.release_time_utc,
            chain: e.correlation_chain, country: e.country,
            forecast: e.forecast, previous: e.prev_value,
            isToday, isUpcoming,
            dayLabel: isToday ? 'Today' : isUpcoming ? `In ${dayDiff}d` : 'Passed',
          };
        });
      })(),
      recentReleases: recentReleases.rows.map(r => ({
        event: r.event_name, actual: r.actual, consensus: r.consensus,
        surprise: r.surprise_pct, date: r.release_date,
      })),
      smtSignals: smtRes.rows.map(s => ({
        pair1: s.pair1, pair2: s.pair2, type: s.type, confidence: s.confidence,
      })),
      recentEntries: entriesRes.rows.map(e => ({
        direction: e.direction, entry: e.entry_price, sl: e.stop_loss, tp: e.take_profit,
        rr: e.rr_ratio, confidence: e.total_confidence, result: e.result,
        createdAt: e.created_at,
      })),
      h4Candles: h4CandlesRaw.map(c => ({
        o: c.open, h: c.high, l: c.low, c: c.close, t: c.timestamp,
      })),
      h1Candles: h1CandlesRaw.map(c => ({
        o: c.open, h: c.high, l: c.low, c: c.close, t: c.timestamp,
      })),
      currentTime: now.toISOString(),
    };

    res.json({ status: 'ok', data: context });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ AI NARRATIVE GENERATION ═══
app.post('/api/ai/narrative', async (req, res) => {
  try {
    const { context, type } = req.body;
    if (!context || !type) return res.status(400).json({ error: 'context and type required' });

    const systemPrompt = type === 'weekly'
      ? `You are Aegis Terminal's weekly market analyst. Generate a professional weekly outlook narrative for ${context.symbol || 'the market'}.

Analyze the provided data and produce a structured weekly outlook with:
1. WEEKLY BIAS — Clear bullish/bearish/neutral stance with reasoning
2. KEY LEVELS — Important support/resistance from the data
3. FUNDAMENTAL CONTEXT — How upcoming events affect the outlook
4. RISK FACTORS — What could invalidate the bias
5. TRADE PLAN — Suggested approach for the week

Rules:
- Be specific with price levels when available
- Reference the weekly model (classic/consolidation/midweek reversal)
- Factor in event proximity and week type
- Keep it under 400 words
- Use professional trading language
- Format with markdown headings`
      : `You are Aegis Terminal's daily market analyst. Generate a professional daily outlook narrative for ${context.symbol || 'the market'}.

Analyze the provided data and produce a structured daily outlook with:
1. TODAY'S BIAS — Clear direction with reasoning
2. SESSION PLAN — Which sessions to focus on and why
3. KEY LEVELS — Intraday support/resistance
4. CATALYSTS — Today's events and their expected impact
5. ENTRY ZONES — Where to look for entries
6. RISK MANAGEMENT — Stop placement and position sizing

Rules:
- Reference the day type (manipulation/continuation/reversal/expansion/distribution)
- Factor in event proximity
- Be specific with price levels
- Keep it under 350 words
- Use professional trading language
- Format with markdown headings`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Market Context:\n${JSON.stringify(context, null, 2)}` },
    ];

    const aiRes = await fetch(`${MIMO_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIMO_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1500,
        stream: false,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return res.status(502).json({ error: `AI API error: ${aiRes.status}`, detail: errText });
    }

    const data = await aiRes.json();
    const narrative = data.choices?.[0]?.message?.content || '';

    res.json({
      status: 'ok',
      data: {
        narrative,
        model: data.model || MIMO_MODEL,
        type,
        symbol: context.symbol,
        timestamp: Date.now(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
console.log('Endpoints: + /api/context/weekly/:symbol, /api/context/daily/:symbol, /api/ai/narrative');

// XAUUSD Deep Analysis
const { analyzeXAUUSD } = require("./xau-deep-analysis");
app.get("/api/xau/deep-analysis", async (req, res) => {
  try {
    const analysis = await analyzeXAUUSD();
    if (!analysis) return res.status(404).json({ error: "Insufficient data" });
    res.json({ status: "ok", data: analysis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// CRYPTO SIGNALS
// ═══════════════════════════════════════════════════════════════

// Get active signals
app.get('/api/crypto/signals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await pool.query(
      `SELECT id, symbol, timeframe, bias, confidence, price, entry_price, stop_loss, take_profit, risk_reward,
              setups, reasoning, confluence_score, status, hit_tp, hit_sl, closed_at, exit_price, pnl_pct, created_at
       FROM crypto_signals
       WHERE status = 'active'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ status: 'ok', signals: result.rows, total: result.rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get signal history (closed signals with performance)
app.get('/api/crypto/signals/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await pool.query(
      `SELECT id, symbol, timeframe, bias, confidence, price, entry_price, stop_loss, take_profit, risk_reward,
              status, hit_tp, hit_sl, closed_at, exit_price, pnl_pct, created_at
       FROM crypto_signals
       WHERE status IN ('closed', 'expired', 'hit_tp', 'hit_sl')
       ORDER BY closed_at DESC NULLS LAST, created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ status: 'ok', history: result.rows, total: result.rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get signal stats
app.get('/api/crypto/signals/stats', async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count FROM crypto_signals');
    const active = await pool.query("SELECT COUNT(*) as count FROM crypto_signals WHERE status = 'active'");
    const hitTp = await pool.query("SELECT COUNT(*) as count FROM crypto_signals WHERE hit_tp = true");
    const hitSl = await pool.query("SELECT COUNT(*) as count FROM crypto_signals WHERE hit_sl = true");
    const avgPnl = await pool.query("SELECT AVG(pnl_pct) as avg_pnl FROM crypto_signals WHERE pnl_pct IS NOT NULL");
    const byBias = await pool.query("SELECT bias, COUNT(*) as count, AVG(confidence) as avg_conf FROM crypto_signals GROUP BY bias");

    res.json({
      status: 'ok',
      stats: {
        total: parseInt(total.rows[0].count),
        active: parseInt(active.rows[0].count),
        hit_tp: parseInt(hitTp.rows[0].count),
        hit_sl: parseInt(hitSl.rows[0].count),
        win_rate: hitTp.rows[0].count > 0
          ? Math.round(parseInt(hitTp.rows[0].count) / (parseInt(hitTp.rows[0].count) + parseInt(hitSl.rows[0].count)) * 100)
          : 0,
        avg_pnl: avgPnl.rows[0].avg_pnl ? Math.round(parseFloat(avgPnl.rows[0].avg_pnl) * 100) / 100 : 0,
        by_bias: byBias.rows.map(r => ({ bias: r.bias, count: parseInt(r.count), avg_confidence: Math.round(parseFloat(r.avg_conf)) })),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get screening results
app.get('/api/crypto/screening', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crypto_screening ORDER BY scan_time DESC LIMIT 50`
    );
    res.json({ status: 'ok', screenings: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get live price for a symbol
app.get('/api/crypto/live/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await pool.query(
      `SELECT symbol, timeframe, open, high, low, close, volume, timestamp
       FROM crypto_candles
       WHERE symbol = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [symbol.toUpperCase()]
    );
    res.json({ status: 'ok', candle: result.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get candle history for a symbol
app.get('/api/crypto/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const timeframe = req.query.timeframe || 'H1';
    const limit = parseInt(req.query.limit) || 200;
    const result = await pool.query(
      `SELECT open as o, high as h, low as l, close as c, volume as v, timestamp as t
       FROM crypto_candles
       WHERE symbol = $1 AND timeframe = $2
       ORDER BY timestamp ASC
       LIMIT $3`,
      [symbol.toUpperCase(), timeframe.toUpperCase(), limit]
    );
    res.json({ status: 'ok', candles: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

console.log('Endpoints: + /api/crypto/signals, /api/crypto/signals/history, /api/crypto/signals/stats, /api/crypto/screening, /api/crypto/live/:symbol, /api/crypto/history/:symbol');

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE & ADAPTIVE SCORING
// ═══════════════════════════════════════════════════════════════

// Get latest performance report
app.get('/api/crypto/performance', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await pool.query(
      `SELECT report_data FROM crypto_performance_reports
       WHERE period_days = $1
       ORDER BY generated_at DESC LIMIT 1`,
      [days]
    );
    if (result.rows.length > 0) {
      return res.json({ status: 'ok', report: result.rows[0].report_data });
    }
    res.json({ status: 'ok', report: null, message: 'No reports yet. Run analytics.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get adaptive weights
app.get('/api/crypto/weights', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT weights, sample_size, generated_at
       FROM adaptive_weights ORDER BY generated_at DESC LIMIT 1`
    );
    if (result.rows.length > 0) {
      return res.json({
        status: 'ok',
        weights: result.rows[0].weights,
        sample_size: result.rows[0].sample_size,
        updated_at: result.rows[0].generated_at,
      });
    }
    res.json({ status: 'ok', weights: null, message: 'No weights yet. Run adaptive scoring.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual trigger: run outcome tracker
app.post('/api/crypto/track', async (req, res) => {
  try {
    const { trackOutcomes } = require('./outcome-tracker');
    const result = await trackOutcomes();
    res.json({ status: 'ok', result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual trigger: generate performance report
app.post('/api/crypto/analytics', async (req, res) => {
  try {
    const { generateReport } = require('./performance-analytics');
    const days = req.body?.days || 30;
    const report = await generateReport(days);
    res.json({ status: 'ok', report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual trigger: regenerate adaptive weights
app.post('/api/crypto/weights/generate', async (req, res) => {
  try {
    const { generateWeights } = require('./adaptive-scoring');
    const weights = await generateWeights();
    res.json({ status: 'ok', weights });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Performance by symbol breakdown
app.get('/api/crypto/performance/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await pool.query(`
      SELECT
        symbol, bias, confidence, entry_price, stop_loss, take_profit,
        risk_reward, status, hit_tp, hit_sl, pnl_pct, exit_price,
        created_at, closed_at
      FROM crypto_signals
      WHERE symbol = $1 AND status != 'active'
      ORDER BY created_at DESC
      LIMIT 50
    `, [symbol.toUpperCase()]);

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE hit_tp = true) as wins,
        COUNT(*) FILTER (WHERE hit_sl = true) as losses,
        AVG(pnl_pct) as avg_pnl,
        SUM(pnl_pct) as total_pnl
      FROM crypto_signals
      WHERE symbol = $1 AND status != 'active'
    `, [symbol.toUpperCase()]);

    res.json({
      status: 'ok',
      symbol: symbol.toUpperCase(),
      stats: stats.rows[0] ? {
        total: parseInt(stats.rows[0].total),
        wins: parseInt(stats.rows[0].wins),
        losses: parseInt(stats.rows[0].losses),
        win_rate: parseInt(stats.rows[0].total) > 0
          ? Math.round(parseInt(stats.rows[0].wins) / parseInt(stats.rows[0].total) * 100) : 0,
        avg_pnl: stats.rows[0].avg_pnl ? Math.round(parseFloat(stats.rows[0].avg_pnl) * 100) / 100 : 0,
        total_pnl: stats.rows[0].total_pnl ? Math.round(parseFloat(stats.rows[0].total_pnl) * 100) / 100 : 0,
      } : null,
      signals: result.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

console.log('Endpoints: + /api/crypto/performance, /api/crypto/weights, /api/crypto/track, /api/crypto/analytics');

// ═══════════════════════════════════════════════════════════════
// ALERT QUEUE (for Telegram delivery via Hermes)
// ═══════════════════════════════════════════════════════════════

// Get pending alerts (unsent)
app.get('/api/crypto/alerts/pending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await pool.query(
      `SELECT id, alert_type, symbol, data, created_at
       FROM crypto_alert_queue
       WHERE sent = false
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    res.json({ status: 'ok', alerts: result.rows, total: result.rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark alerts as sent
app.post('/api/crypto/alerts/ack', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await pool.query(
      `UPDATE crypto_alert_queue SET sent = true WHERE id = ANY($1)`,
      [ids]
    );
    res.json({ status: 'ok', acked: ids.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

console.log('Endpoints: + /api/crypto/alerts/pending, /api/crypto/alerts/ack');

// ═══════════════════════════════════════════════════════════════
// MT5 LIVE PRICE — Poller + WebSocket
// ═══════════════════════════════════════════════════════════════
const mt5Poller = require('./mt5-price-poller');
const { WebSocketServer } = require('ws');

// Start poller on server boot
mt5Poller.start();

// REST: Get cached price for one symbol
app.get('/api/mt5/price/:symbol', (req, res) => {
  const price = mt5Poller.getPrice(req.params.symbol.toUpperCase());
  if (!price) return res.status(404).json({ error: 'No price data yet', symbol: req.params.symbol });
  res.json({ status: 'ok', data: price });
});

// REST: Get all cached prices
app.get('/api/mt5/prices', (req, res) => {
  res.json({ status: 'ok', data: mt5Poller.getAllPrices() });
});

// REST: Poller health/stats
app.get('/api/mt5/stats', (req, res) => {
  res.json({ status: 'ok', data: mt5Poller.getStats() });
});

// ─── VPS Dashboard Endpoints ────────────────────────────────
app.get('/api/vps/metrics', (req, res) => {
  res.json({ status: 'ok', data: getMetrics() });
});

app.get('/api/vps/processes', (req, res) => {
  res.json({ status: 'ok', data: getTopProcesses() });
});

app.get('/api/vps/services', (req, res) => {
  res.json({ status: 'ok', data: getServices() });
});

// WebSocket: Live price stream for frontend
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Aegis Terminal API v2 running on port ${PORT}`);
});

// Manual upgrade routing — ws v8 can't share a server between two WebSocketServer instances
const wssPrices = new WebSocketServer({ noServer: true });
const wsClients = new Set();

wssPrices.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected (${wsClients.size} total)`);

  // Send current prices immediately
  ws.send(JSON.stringify({ type: 'snapshot', data: mt5Poller.getAllPrices() }));

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected (${wsClients.size} total)`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    wsClients.delete(ws);
  });
});

// Broadcast price changes to all WS clients
mt5Poller.on('price', (price) => {
  if (wsClients.size === 0) return;
  const msg = JSON.stringify({ type: 'price', data: price });
  for (const ws of wsClients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(msg);
    }
  }
});

console.log('MT5 Poller: started (2s interval, 5 symbols)');

// ─── VPS Dashboard WebSocket ────────────────────────────────
const wssVps = new WebSocketServer({ noServer: true });

seedMetrics();

const vpsInterval = setInterval(() => {
  if (wssVps.clients.size === 0) return;
  const payload = JSON.stringify({
    type: 'vps_metrics',
    data: getMetrics(),
  });
  for (const ws of wssVps.clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}, 2000);

wssVps.on('connection', (ws) => {
  console.log('[VPS] dashboard client connected');
  ws.send(JSON.stringify({ type: 'vps_metrics', data: getMetrics() }));
  ws.on('close', () => console.log('[VPS] dashboard client disconnected'));
});

// Route upgrade requests to the correct WebSocket server
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === '/ws/prices') {
    wssPrices.handleUpgrade(req, socket, head, (ws) => {
      wssPrices.emit('connection', ws, req);
    });
  } else if (pathname === '/ws/vps') {
    wssVps.handleUpgrade(req, socket, head, (ws) => {
      wssVps.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

console.log('WebSocket: /ws/prices, /ws/vps');

process.on('SIGTERM', () => clearInterval(vpsInterval));
process.on('SIGINT', () => clearInterval(vpsInterval));
