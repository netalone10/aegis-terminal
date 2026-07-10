// Aegis Terminal — MT5 Candle Ingestion Pipeline
// Fetches candles from MT5 feed server → stores in PostgreSQL

const { Pool } = require('pg');

const MT5_URL = 'http://localhost:8500'; // Local MT5 API (same VPS)
const MT5_KEY = 'ThLNeGzMMCRcPsLSicfq9OCHkfIiJdrcVJaN0d8d9Mo';

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026', max: 5,
});

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'];
const MT5_MAP = {
  XAUUSD: 'XAUUSD.vxc', EURUSD: 'EURUSD.vxc', GBPUSD: 'GBPUSD.vxc',
  USDJPY: 'USDJPY.vxc', BTCUSD: 'BTCUSD.vxc',
};
const TIMEFRAMES = [
  { tf: 'M15', count: 200 },
  { tf: 'H1', count: 200 },
  { tf: 'H4', count: 200 },   // MT5 doesn't have H4 natively, CF Worker aggregates from H1
  { tf: 'D1', count: 120 },
  { tf: 'W1', count: 52 },
];

// For H4, we fetch H1 and aggregate
function aggregateH1toH4(h1Candles) {
  const agg = [];
  for (let i = 0; i < h1Candles.length; i += 4) {
    const chunk = h1Candles.slice(i, i + 4);
    if (chunk.length === 0) continue;
    agg.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
    });
  }
  return agg;
}

async function fetchCandles(mt5Symbol, timeframe, count) {
  const res = await fetch(`${MT5_URL}/candles?symbol=${mt5Symbol}&timeframe=${timeframe}&count=${count}`, {
    headers: { 'X-API-Key': MT5_KEY },
  });
  if (!res.ok) throw new Error(`MT5 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candles || [];
}

async function upsertCandles(symbol, tf, candles) {
  if (candles.length === 0) return 0;
  let inserted = 0;
  // Batch upsert — 50 candles at a time
  for (let i = 0; i < candles.length; i += 50) {
    const batch = candles.slice(i, i + 50);
    const values = [];
    const params = [];
    let paramIdx = 1;
    for (const c of batch) {
      values.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6},$${paramIdx+7})`);
      params.push(symbol, tf, c.open, c.high, c.low, c.close, c.volume || 0, c.time);
      paramIdx += 8;
    }
    const sql = `INSERT INTO historical_ohlc (symbol, timeframe, open, high, low, close, volume, timestamp)
      VALUES ${values.join(',')}
      ON CONFLICT (symbol, timeframe, timestamp)
      DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume`;
    const res = await pool.query(sql, params);
    inserted += res.rowCount || 0;
  }
  return inserted;
}

async function run() {
  const startTime = Date.now();
  let totalInserted = 0;
  const results = [];

  for (const symbol of SYMBOLS) {
    const mt5Symbol = MT5_MAP[symbol];
    if (!mt5Symbol) continue;

    for (const { tf, count } of TIMEFRAMES) {
      try {
        let candles;
        if (tf === 'H4') {
          // Fetch H1 and aggregate
          const h1 = await fetchCandles(mt5Symbol, 'H1', count * 4);
          candles = aggregateH1toH4(h1);
        } else {
          candles = await fetchCandles(mt5Symbol, tf, count);
        }
        const inserted = await upsertCandles(symbol, tf, candles);
        totalInserted += inserted;
        results.push(`${symbol}/${tf}: ${candles.length} candles, ${inserted} upserted`);
      } catch (e) {
        results.push(`${symbol}/${tf}: ERROR - ${e.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] Ingestion complete in ${elapsed}s`);
  console.log(`  Total rows upserted: ${totalInserted}`);
  results.forEach(r => console.log(`  ${r}`));

  await pool.end();
}

run().catch(e => {
  console.error('Pipeline failed:', e.message);
  process.exit(1);
});
