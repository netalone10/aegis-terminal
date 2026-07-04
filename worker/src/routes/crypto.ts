import { Hono } from 'hono';
import type { Bindings } from '../index';

export const cryptoRoutes = new Hono<{ Bindings: Bindings }>();

const VPS_API = 'https://engine.aegisterminal.app';

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
