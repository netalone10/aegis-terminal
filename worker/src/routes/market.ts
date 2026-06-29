import { Hono } from 'hono';

export const marketRoutes = new Hono();

marketRoutes.get('/', (c) => c.json({ status: 'ok', module: 'market' }));
marketRoutes.get('/price/:symbol', (c) => c.json({ status: 'ok', module: 'market', action: 'price' }));
marketRoutes.get('/candles/:symbol', (c) => c.json({ status: 'ok', module: 'market', action: 'candles' }));
marketRoutes.get('/orderbook/:symbol', (c) => c.json({ status: 'ok', module: 'market', action: 'orderbook' }));
