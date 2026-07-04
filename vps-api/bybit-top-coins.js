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
