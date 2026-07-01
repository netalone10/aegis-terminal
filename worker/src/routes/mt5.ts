import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const mt5Routes = new Hono<{ Bindings: Bindings }>();

async function mt5Fetch(env: Bindings, path: string): Promise<any> {
  const base = env.MT5_API_URL;
  const res = await fetch(`${base}${path}`, {
    headers: { 'X-API-Key': env.MT5_API_KEY },
  });
  if (!res.ok) throw new Error(`MT5 API ${res.status}`);
  return res.json();
}

// GET /api/mt5/candles?symbol=XAUUSD.vxc&timeframe=H1&count=100 — raw OHLCV from the broker
mt5Routes.get('/candles', async (c) => {
  const symbol = c.req.query('symbol') ?? 'XAUUSD.vxc';
  const timeframe = c.req.query('timeframe') ?? 'H1';
  const count = c.req.query('count') ?? '100';
  const cache = new Cache(c.env.AEGIS_CACHE, 30);

  try {
    const data = await cache.getOrSet(
      `mt5:candles:${symbol}:${timeframe}:${count}`,
      () => mt5Fetch(c.env, `/candles?symbol=${symbol}&timeframe=${timeframe}&count=${count}`),
      { ttl: 60 }
    );
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/mt5/price?symbol=XAUUSD.vxc — live bid/ask/spread from the broker
mt5Routes.get('/price', async (c) => {
  const symbol = c.req.query('symbol') ?? 'XAUUSD.vxc';
  const cache = new Cache(c.env.AEGIS_CACHE, 5);

  try {
    const data = await cache.getOrSet(
      `mt5:price:${symbol}`,
      () => mt5Fetch(c.env, `/price?symbol=${symbol}`),
      { ttl: 60 }
    );
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/mt5/indicators?symbol=XAUUSD.vxc&timeframe=H1 — EMA/RSI/ATR computed from broker candles
mt5Routes.get('/indicators', async (c) => {
  const symbol = c.req.query('symbol') ?? 'XAUUSD.vxc';
  const timeframe = c.req.query('timeframe') ?? 'H1';
  const cache = new Cache(c.env.AEGIS_CACHE, 30);

  try {
    const data = await cache.getOrSet(
      `mt5:indicators:${symbol}:${timeframe}`,
      () => mt5Fetch(c.env, `/indicators?symbol=${symbol}&timeframe=${timeframe}`),
      { ttl: 60 }
    );
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
