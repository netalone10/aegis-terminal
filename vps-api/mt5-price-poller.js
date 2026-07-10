// Aegis Terminal — MT5 Live Price Poller
// Polls local MT5 API (localhost:8500) every 2s, caches in memory
// Zero external dependencies — just fetch + EventEmitter

const EventEmitter = require('events');

const MT5_API = process.env.MT5_API_URL || 'http://localhost:8500';
const MT5_KEY = process.env.MT5_API_KEY || 'ThLNeGzMMCRcPsLSicfq9OCHkfIiJdrcVJaN0d8d9Mo';
const POLL_INTERVAL = parseInt(process.env.MT5_POLL_INTERVAL || '2000'); // 2s default

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'];

class MT5PricePoller extends EventEmitter {
  constructor() {
    super();
    this.prices = new Map();        // symbol → { bid, ask, spread, time, updated }
    this.running = false;
    this.interval = null;
    this.errors = 0;
    this.lastPoll = null;
  }

  async fetchPrice(symbol) {
    const res = await fetch(`${MT5_API}/price?symbol=${symbol}`, {
      headers: { 'X-API-Key': MT5_KEY },
      signal: AbortSignal.timeout(3000), // 3s timeout
    });
    if (!res.ok) throw new Error(`MT5 ${res.status}`);
    return await res.json();
  }

  async pollOnce() {
    const results = await Promise.allSettled(
      SYMBOLS.map(async (sym) => {
        const data = await this.fetchPrice(sym);
        const price = {
          symbol: sym,
          bid: data.bid,
          ask: data.ask,
          spread: data.spread,
          time: data.time,
          updated: Date.now(),
        };
        const prev = this.prices.get(sym);
        this.prices.set(sym, price);

        // Emit only if price changed
        if (!prev || prev.bid !== price.bid || prev.ask !== price.ask) {
          this.emit('price', price);
          this.emit(`price:${sym}`, price);
        }

        return price;
      })
    );

    this.lastPoll = Date.now();
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      this.errors += failures.length;
      this.emit('error', failures.map(f => f.reason?.message || 'unknown'));
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[MT5Poller] Starting — polling every ${POLL_INTERVAL}ms for ${SYMBOLS.join(', ')}`);

    // Initial poll immediately
    this.pollOnce().catch(e => console.error('[MT5Poller] Initial poll error:', e.message));

    this.interval = setInterval(() => {
      this.pollOnce().catch(e => console.error('[MT5Poller] Poll error:', e.message));
    }, POLL_INTERVAL);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log('[MT5Poller] Stopped');
  }

  getPrice(symbol) {
    return this.prices.get(symbol) || null;
  }

  getAllPrices() {
    const result = {};
    for (const [sym, price] of this.prices) {
      result[sym] = price;
    }
    return result;
  }

  getStats() {
    return {
      running: this.running,
      symbols: SYMBOLS.length,
      lastPoll: this.lastPoll ? new Date(this.lastPoll).toISOString() : null,
      errors: this.errors,
      prices: this.getAllPrices(),
    };
  }
}

// Singleton
const poller = new MT5PricePoller();

module.exports = poller;
