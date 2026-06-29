import { Hono } from 'hono';

export const newsRoutes = new Hono();

newsRoutes.get('/', (c) => c.json({ status: 'ok', module: 'news' }));
newsRoutes.get('/latest', (c) => c.json({ status: 'ok', module: 'news', action: 'latest' }));
newsRoutes.get('/symbol/:symbol', (c) => c.json({ status: 'ok', module: 'news', action: 'by_symbol' }));
