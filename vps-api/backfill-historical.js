// vps-api/backfill-historical.js
// Fetch historical candles from Bybit REST API and populate crypto_candles table
// Usage: node backfill-historical.js [--symbols BTCUSDT,ETHUSDT] [--candles 200]

const { Pool } = require('pg');
const bybitConfig = require('./bybit-config.json');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aegis_terminal',
  user: 'aegis',
  password: 'aegis_terminal_2026',
});

const BYBIT_API = 'https://api.bybit.com';

// Map our timeframes to Bybit intervals
const TIMEFRAME_MAP = {
  'M5': '5',
  'M15': '15',
  'H1': '60',
  'H4': '240',
};

// Default: 200 candles per timeframe (enough for signal engine)
const DEFAULT_CANDLES = 200;

// Rate limiting: Bybit allows 120 requests/minute for market data
const RATE_LIMIT_DELAY = 600; // ms between requests

async function fetchKlines(symbol, interval, limit = 200, start = null) {
  const params = new URLSearchParams({
    category: 'linear',
    symbol,
    interval,
    limit: limit.toString(),
  });
  if (start) params.set('start', start.toString());

  const url = `${BYBIT_API}/v5/market/kline?${params}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'X-BYBIT-API-KEY': bybitConfig.apiKey,
      },
    });
    const data = await response.json();
    
    if (data.retCode !== 0) {
      console.error(`Bybit API error for ${symbol} ${interval}:`, data.retMsg);
      return [];
    }
    
    return data.result.list || [];
  } catch (err) {
    console.error(`Failed to fetch ${symbol} ${interval}:`, err.message);
    return [];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function storeCandle(candle) {
  try {
    await pool.query(
      `INSERT INTO crypto_candles (symbol, timeframe, open, high, low, close, volume, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (symbol, timeframe, timestamp)
       DO UPDATE SET open=$3, high=$4, low=$5, close=$6, volume=$7`,
      [candle.symbol, candle.timeframe, candle.open, candle.high,
       candle.low, candle.close, candle.volume, candle.timestamp]
    );
    return true;
  } catch (err) {
    console.error(`Failed to store candle:`, err.message);
    return false;
  }
}

async function backfillSymbol(symbol, numCandles) {
  console.log(`\n=== Backfilling ${symbol} ===`);
  
  let totalStored = 0;
  
  for (const [timeframe, bybitInterval] of Object.entries(TIMEFRAME_MAP)) {
    console.log(`  Fetching ${numCandles} ${timeframe} candles...`);
    
    // Calculate start time (ms ago)
    const now = Date.now();
    const intervalMs = {
      '5': 5 * 60 * 1000,
      '15': 15 * 60 * 1000,
      '60': 60 * 60 * 1000,
      '240': 4 * 60 * 60 * 1000,
    };
    const startTime = now - (numCandles * intervalMs[bybitInterval]);
    
    const klines = await fetchKlines(symbol, bybitInterval, numCandles, startTime);
    
    if (klines.length === 0) {
      console.log(`    No data returned for ${timeframe}`);
      await sleep(RATE_LIMIT_DELAY);
      continue;
    }
    
    let stored = 0;
    for (const k of klines) {
      const candle = {
        symbol,
        timeframe,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        timestamp: Math.floor(parseInt(k[0]) / 1000), // ms to seconds
      };
      
      const ok = await storeCandle(candle);
      if (ok) stored++;
    }
    
    console.log(`    Stored ${stored}/${klines.length} ${timeframe} candles`);
    totalStored += stored;
    
    // Rate limit
    await sleep(RATE_LIMIT_DELAY);
  }
  
  return totalStored;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse args
  let symbols = null;
  let numCandles = DEFAULT_CANDLES;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbols' && args[i + 1]) {
      symbols = args[i + 1].split(',');
      i++;
    }
    if (args[i] === '--candles' && args[i + 1]) {
      numCandles = parseInt(args[i + 1]);
      i++;
    }
  }
  
  // Default: fetch top 10 from DB
  if (!symbols) {
    const result = await pool.query('SELECT symbol FROM crypto_top_coins ORDER BY rank');
    if (result.rows.length > 0) {
      symbols = result.rows.map(r => r.symbol);
    } else {
      // Fallback: hardcoded top 10
      symbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
        'DOGEUSDT', 'BNBUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'
      ];
    }
  }
  
  console.log('=== Bybit Historical Backfill ===');
  console.log(`Symbols: ${symbols.join(', ')}`);
  console.log(`Candles per timeframe: ${numCandles}`);
  console.log(`Timeframes: ${Object.keys(TIMEFRAME_MAP).join(', ')}`);
  
  const startTime = Date.now();
  let grandTotal = 0;
  
  for (const symbol of symbols) {
    const total = await backfillSymbol(symbol, numCandles);
    grandTotal += total;
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n=== Backfill Complete ===');
  console.log(`Total candles stored: ${grandTotal}`);
  console.log(`Time elapsed: ${elapsed}s`);
  
  // Verify
  const verify = await pool.query(
    'SELECT symbol, timeframe, COUNT(*) as cnt FROM crypto_candles GROUP BY symbol, timeframe ORDER BY symbol, timeframe'
  );
  console.log('\nVerification:');
  for (const row of verify.rows) {
    console.log(`  ${row.symbol} ${row.timeframe}: ${row.cnt} candles`);
  }
  
  await pool.end();
  process.exit(0);
}

// Run
main().catch(err => {
  console.error('Backfill failed:', err);
  pool.end();
  process.exit(1);
});
