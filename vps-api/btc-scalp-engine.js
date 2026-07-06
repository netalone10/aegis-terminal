// btc-scalp-engine.js — BTC Scalping Signal Engine
// Timeframes: 1m, 5m, 15m (fast scalping)
// Tight TP/SL, short signal lifetime (2 hours)
// 3-layer confluence: SMC + Technical + Volume

const { Pool } = require('pg');
const { getTechnicals } = require('./indicators');
const { getSMCAnalysis } = require('./smc-analysis');

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026',
});

const SYMBOL = 'BTCUSDT';
const TIMEFRAMES = ['M1', 'M5', 'M15'];
const MIN_CANDLES = 30;
const SIGNAL_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── Get Candles ──────────────────────────────────────────
async function getCandles(symbol, timeframe, limit = 200) {
  const result = await pool.query(
    `SELECT open as o, high as h, low as l, close as c, volume as v, timestamp as t
     FROM crypto_candles
     WHERE symbol = $1 AND timeframe = $2
     ORDER BY timestamp ASC
     LIMIT $3`,
    [symbol, timeframe, limit]
  );
  return result.rows.map(r => ({
    o: parseFloat(r.o), h: parseFloat(r.h), l: parseFloat(r.l),
    c: parseFloat(r.c), v: parseFloat(r.v), t: parseInt(r.t),
  }));
}

// ─── Layer 1: SMC (adapted for scalping) ──────────────────
function analyzeSMCLayer(smcs) {
  let bullishScore = 0, bearishScore = 0;
  const reasons = [];

  for (const [tf, smc] of Object.entries(smcs)) {
    // Scalping: M15 has highest weight (highest TF for scalping)
    const weight = tf === 'M15' ? 3 : tf === 'M5' ? 2 : 1;

    if (smc.bias === 'bullish') { bullishScore += weight; reasons.push(`${tf} SMC bullish`); }
    if (smc.bias === 'bearish') { bearishScore += weight; reasons.push(`${tf} SMC bearish`); }

    // BOS confirmation
    const lastBOS = smc.bos[smc.bos.length - 1];
    if (lastBOS) {
      if (lastBOS.type === 'bullish_bos') { bullishScore += weight; reasons.push(`${tf} bullish BOS`); }
      if (lastBOS.type === 'bearish_bos') { bearishScore += weight; reasons.push(`${tf} bearish BOS`); }
    }

    // FVGs (Fair Value Gaps) — key for scalping entries
    const bullishFVGs = smc.fvgs.filter(f => f.type === 'bullish_fvg').length;
    const bearishFVGs = smc.fvgs.filter(f => f.type === 'bearish_fvg').length;
    if (bullishFVGs > bearishFVGs) { bullishScore += 1; }
    if (bearishFVGs > bullishFVGs) { bearishScore += 1; }

    // Order blocks
    const bullishOBs = smc.orderBlocks.filter(o => o.type === 'bullish_ob').length;
    const bearishOBs = smc.orderBlocks.filter(o => o.type === 'bearish_ob').length;
    if (bullishOBs > bearishOBs) { bullishScore += 1; }
    if (bearishOBs > bullishOBs) { bearishScore += 1; }
  }

  const total = bullishScore + bearishScore || 1;
  return {
    direction: bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral',
    confidence: Math.round(Math.max(bullishScore, bearishScore) / total * 100),
    reasons, bullishScore, bearishScore,
  };
}

// ─── Layer 2: Technical Indicators (scalping-optimized) ───
function analyzeTechnicalLayer(technicals) {
  let bullishScore = 0, bearishScore = 0;
  const reasons = [];

  for (const [tf, tech] of Object.entries(technicals)) {
    const weight = tf === 'M15' ? 2 : tf === 'M5' ? 1.5 : 1;
    if (!tech || tech.rsi === null) continue;

    // RSI — tighter thresholds for scalping
    if (tech.rsi > 55) { bullishScore += weight; reasons.push(`${tf} RSI ${tech.rsi} bullish`); }
    if (tech.rsi < 45) { bearishScore += weight; reasons.push(`${tf} RSI ${tech.rsi} bearish`); }
    if (tech.rsi > 70) { bearishScore += 1.5; reasons.push(`${tf} RSI overbought`); }
    if (tech.rsi < 30) { bullishScore += 1.5; reasons.push(`${tf} RSI oversold`); }

    // MACD — faster signal for scalping
    if (tech.macdHist !== null) {
      if (tech.macdHist > 0) { bullishScore += weight * 0.8; reasons.push(`${tf} MACD bullish`); }
      if (tech.macdHist < 0) { bearishScore += weight * 0.8; reasons.push(`${tf} MACD bearish`); }
    }

    // EMA crossover (9/21 for scalping, not 20/50)
    if (tech.ema9 && tech.ema21) {
      if (tech.ema9 > tech.ema21) { bullishScore += weight * 0.6; }
      if (tech.ema9 < tech.ema21) { bearishScore += weight * 0.6; }
    }

    // Bollinger Band position
    if (tech.bbUpper && tech.bbLower && tech.price) {
      if (tech.price > tech.bbUpper) { bearishScore += 0.5; reasons.push(`${tf} above BB upper`); }
      if (tech.price < tech.bbLower) { bullishScore += 0.5; reasons.push(`${tf} below BB lower`); }
    }

    // Stochastic — key for scalping
    if (tech.stochK !== null && tech.stochD !== null) {
      if (tech.stochK > 80 && tech.stochK > tech.stochD) { bearishScore += 0.8; }
      if (tech.stochK < 20 && tech.stochK < tech.stochD) { bullishScore += 0.8; }
    }
  }

  const total = bullishScore + bearishScore || 1;
  return {
    direction: bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral',
    confidence: Math.round(Math.max(bullishScore, bearishScore) / total * 100),
    reasons, bullishScore, bearishScore,
  };
}

// ─── Layer 3: Volume Analysis (scalping) ──────────────────
function analyzeVolumeLayer(candlesMap) {
  let bullishScore = 0, bearishScore = 0;
  const reasons = [];

  for (const [tf, candles] of Object.entries(candlesMap)) {
    if (candles.length < 20) continue;
    const weight = tf === 'M15' ? 2 : tf === 'M5' ? 1.5 : 1;
    const recent = candles.slice(-20);
    const avgVol = recent.reduce((s, c) => s + c.v, 0) / recent.length;
    const lastVol = recent[recent.length - 1].v;
    const priceChange = (recent[recent.length - 1].c - recent[0].c) / recent[0].c * 100;

    // Volume spike — critical for scalping
    if (lastVol > avgVol * 2) {
      if (priceChange > 0) { bullishScore += weight * 1.5; reasons.push(`${tf} volume spike + bullish`); }
      else { bearishScore += weight * 1.5; reasons.push(`${tf} volume spike + bearish`); }
    } else if (lastVol > avgVol * 1.5) {
      if (priceChange > 0) { bullishScore += weight; }
      else { bearishScore += weight; }
    }

    // OBV trend (last 10 candles)
    let obvUp = 0, obvDown = 0;
    for (let i = recent.length - 10; i < recent.length; i++) {
      if (recent[i].c > recent[i - 1].c) obvUp += recent[i].v;
      else obvDown += recent[i].v;
    }
    if (obvUp > obvDown * 1.2) { bullishScore += weight * 0.5; }
    if (obvDown > obvUp * 1.2) { bearishScore += weight * 0.5; }

    // Volume climax (exhaustion)
    const last5Vol = recent.slice(-5).reduce((s, c) => s + c.v, 0) / 5;
    const prev5Vol = recent.slice(-10, -5).reduce((s, c) => s + c.v, 0) / 5;
    if (last5Vol > prev5Vol * 2 && Math.abs(priceChange) > 1) {
      reasons.push(`${tf} volume climax detected`);
    }
  }

  const total = bullishScore + bearishScore || 1;
  return {
    direction: bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral',
    confidence: Math.round(Math.max(bullishScore, bearishScore) / total * 100),
    reasons, bullishScore, bearishScore,
  };
}

// ─── Confluence Scoring ───────────────────────────────────
function calculateConfluence(smc, tech, vol) {
  const layers = [smc, tech, vol];
  const directions = layers.map(l => l.direction).filter(d => d !== 'neutral');

  if (directions.length === 0) return null;

  const bulls = directions.filter(d => d === 'bullish').length;
  const bears = directions.filter(d => d === 'bearish').length;
  const agreeCount = Math.max(bulls, bears);

  let bias, confidence;
  if (agreeCount === 3) {
    bias = bulls > bears ? 'bullish' : 'bearish';
    confidence = 80 + Math.round((smc.confidence + tech.confidence + vol.confidence) / 30);
  } else if (agreeCount === 2) {
    bias = bulls > bears ? 'bullish' : 'bearish';
    confidence = 60 + Math.round((smc.confidence + tech.confidence + vol.confidence) / 50);
  } else if (agreeCount === 1) {
    bias = bulls > bears ? 'bullish' : 'bearish';
    confidence = 40 + Math.round((smc.confidence + tech.confidence + vol.confidence) / 70);
  } else {
    return null;
  }

  confidence = Math.min(confidence, 95);

  return {
    bias,
    confidence,
    agreeCount,
    layers: {
      smc: { bias: smc.direction, confidence: smc.confidence, reasons: smc.reasons },
      technical: { bias: tech.direction, confidence: tech.confidence, reasons: tech.reasons },
      volume: { bias: vol.direction, confidence: vol.confidence, reasons: vol.reasons },
    },
  };
}

// ─── Calculate Tight Entry/SL/TP (Scalping) ──────────────
function calculateScalpLevels(price, bias, atr, smcs) {
  // BTC scalping: minimum 100pt range (spread 30pt, need room)
  // Use full ATR, not halved
  const MIN_SL_PTS = 100;  // Minimum SL distance in points
  const MIN_TP_PTS = 150;  // Minimum TP distance in points (better R:R)

  const slDistance = Math.max(atr * 1.2, MIN_SL_PTS);
  const tpDistance = Math.max(atr * 1.8, MIN_TP_PTS);

  let entry, sl, tp, rr;

  if (bias === 'bullish') {
    entry = price;
    sl = price - slDistance;
    tp = price + tpDistance;
  } else {
    entry = price;
    sl = price + slDistance;
    tp = price - tpDistance;
  }

  // Check for FVGs — better entry zones
  for (const [tf, smc] of Object.entries(smcs)) {
    const fvgs = bias === 'bullish'
      ? smc.fvgs.filter(f => f.type === 'bullish_fvg')
      : smc.fvgs.filter(f => f.type === 'bearish_fvg');

    if (fvgs.length > 0) {
      const bestFVG = fvgs[fvgs.length - 1]; // Most recent
      if (bestFVG.startPrice && bestFVG.endPrice) {
        entry = (bestFVG.startPrice + bestFVG.endPrice) / 2;
        if (bias === 'bullish') {
          sl = entry - slDistance;
          tp = entry + tpDistance;
        } else {
          sl = entry + slDistance;
          tp = entry - tpDistance;
        }
      }
    }
  }

  rr = Math.abs(tp - entry) / Math.abs(entry - sl);

  return { entry, sl, tp, rr: Math.round(rr * 100) / 100 };
}

// ─── Build Reasoning ──────────────────────────────────────
function buildReasoning(smc, tech, vol, confluence) {
  const parts = [];

  if (confluence.agreeCount === 3) {
    parts.push('3/3 layers agree — strong confluence');
  } else if (confluence.agreeCount === 2) {
    parts.push('2/3 layers agree — moderate confluence');
  } else {
    parts.push('1/3 layer agrees — weak confluence');
  }

  if (smc.reasons.length > 0) parts.push(`SMC: ${smc.reasons.slice(0, 2).join(', ')}`);
  if (tech.reasons.length > 0) parts.push(`Tech: ${tech.reasons.slice(0, 2).join(', ')}`);
  if (vol.reasons.length > 0) parts.push(`Vol: ${vol.reasons.slice(0, 2).join(', ')}`);

  return parts.join(' | ');
}

// ─── Main Signal Generator ────────────────────────────────
async function generateScalpSignal(symbol = SYMBOL) {
  console.log(`[BTC Scalp] Analyzing ${symbol}...`);

  // Fetch candles for all timeframes
  const candlesMap = {};
  const smcs = {};
  const technicals = {};

  for (const tf of TIMEFRAMES) {
    const candles = await getCandles(symbol, tf, 200);
    if (candles.length < MIN_CANDLES) {
      console.log(`  ${tf}: insufficient candles (${candles.length}/${MIN_CANDLES})`);
      return null;
    }
    candlesMap[tf] = candles;
    smcs[tf] = getSMCAnalysis(candles);
    technicals[tf] = getTechnicals(candles);
  }

  // Analyze each layer
  const smcResult = analyzeSMCLayer(smcs);
  const techResult = analyzeTechnicalLayer(technicals);
  const volResult = analyzeVolumeLayer(candlesMap);

  // Calculate confluence
  const confluence = calculateConfluence(smcResult, techResult, volResult);
  if (!confluence) {
    console.log(`  No signal — layers disagree`);
    return null;
  }

  // Scalping: require at least 2 layers agreeing for entry
  if (confluence.agreeCount < 2) {
    console.log(`  Weak signal (${confluence.agreeCount}/3 layers) — skipping`);
    return null;
  }

  // Calculate ATR for entry/SL/TP
  const m5Candles = candlesMap['M5'];
  const atr = technicals['M5']?.atr || 0;
  const price = m5Candles[m5Candles.length - 1].c;

  // Calculate scalp levels
  const levels = calculateScalpLevels(price, confluence.bias, atr, smcs);

  const signal = {
    symbol,
    timeframe: 'scalp',
    bias: confluence.bias,
    confidence: confluence.confidence,
    price,
    entry: levels.entry,
    sl: levels.sl,
    tp: levels.tp,
    rr: levels.rr,
    structure: smcs,
    technicals,
    volume: candlesMap,
    setups: [{
      type: 'primary',
      entry: levels.entry,
      sl: levels.sl,
      tp: levels.tp,
      rr: levels.rr,
      direction: confluence.bias === 'bullish' ? 'buy' : 'sell',
      timeframe: 'scalp',
      source: 'scalp_engine',
      riskPct: Math.abs(levels.sl - levels.entry) / levels.entry * 100,
    }],
    confluence,
    reasoning: buildReasoning(smcResult, techResult, volResult, confluence),
  };

  console.log(`  Signal: ${signal.bias} (${signal.confidence}%) | Entry: ${signal.entry} | SL: ${signal.sl} | TP: ${signal.tp} | RR: ${signal.rr}`);

  return signal;
}

// ─── Store Signal ─────────────────────────────────────────
async function storeScalpSignal(signal) {
  // DEDUP: Check if active scalp signal already exists for BTCUSDT
  const existing = await pool.query(
    `SELECT id, confidence FROM crypto_signals
     WHERE symbol = $1 AND timeframe = 'scalp' AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [signal.symbol]
  );

  if (existing.rows.length > 0) {
    const old = existing.rows[0];
    const confDiff = signal.confidence - old.confidence;

    if (confDiff > 10) {
      console.log(`[dedup] Replacing old scalp signal (id=${old.id}) — conf ${old.confidence}% → ${signal.confidence}%`);
      await pool.query(
        `UPDATE crypto_signals SET status = 'replaced', closed_at = NOW(), alert_state = 'closed'
         WHERE id = $1`,
        [old.id]
      );
    } else {
      console.log(`[dedup] Skipping — active scalp signal exists (id=${old.id}, conf=${old.confidence}%)`);
      return null;
    }
  }

  const result = await pool.query(
    `INSERT INTO crypto_signals (symbol, timeframe, bias, confidence, price, entry_price, stop_loss, take_profit, risk_reward, structure, technical, volume, setups, confluence, confluence_score, reasoning, status, alert_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'active', 'new')
     RETURNING id`,
    [
      signal.symbol, signal.timeframe, signal.bias, signal.confidence,
      signal.price,
      signal.entry,
      signal.sl,
      signal.tp,
      signal.rr,
      JSON.stringify(signal.structure),
      JSON.stringify(signal.technicals),
      JSON.stringify(signal.volume),
      JSON.stringify(signal.setups),
      JSON.stringify(signal.confluence),
      signal.confidence,
      signal.reasoning,
    ]
  );
  return result.rows[0].id;
}

// ─── Entry ────────────────────────────────────────────────
async function main() {
  try {
    const signal = await generateScalpSignal();
    if (!signal) {
      await pool.end();
      process.exit(0);
    }

    const id = await storeScalpSignal(signal);
    if (id) {
      console.log(`[BTC Scalp] Stored signal: id=${id}`);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[BTC Scalp] Error:', err);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { generateScalpSignal, storeScalpSignal, pool };
}
