// backfill-m1.js — Backfill M1 candles for BTCUSDT
const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, database: 'aegis_terminal', user: 'aegis', password: 'aegis_terminal_2026' });

async function backfillM1() {
  console.log('Backfilling M1 candles for BTCUSDT...');
  const res = await fetch('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&limit=200');
  const data = await res.json();
  if (!data.result || !data.result.list) { console.log('No data'); return; }

  let count = 0;
  for (const k of data.result.list) {
    const [ts, open, high, low, close, vol] = k;
    await pool.query(
      'INSERT INTO crypto_candles (symbol,timeframe,open,high,low,close,volume,timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (symbol,timeframe,timestamp) DO UPDATE SET open=$3,high=$4,low=$5,close=$6,volume=$7',
      ['BTCUSDT', 'M1', open, high, low, close, vol, ts]
    );
    count++;
  }
  console.log('Backfilled ' + count + ' M1 candles');

  const latest = await pool.query("SELECT close, timestamp FROM crypto_candles WHERE symbol='BTCUSDT' AND timeframe='M1' ORDER BY timestamp DESC LIMIT 1");
  console.log('Latest: close=' + latest.rows[0].close + ' ts=' + latest.rows[0].timestamp);
  await pool.end();
}
backfillM1().catch(e => { console.error(e); process.exit(1); });
