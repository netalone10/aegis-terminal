import { Hono } from 'hono';

export const portfolioRoutes = new Hono();

portfolioRoutes.get('/', (c) => c.json({ status: 'ok', module: 'portfolio' }));
portfolioRoutes.get('/positions', (c) => c.json({ status: 'ok', module: 'portfolio', action: 'positions' }));
portfolioRoutes.get('/pnl', (c) => c.json({ status: 'ok', module: 'portfolio', action: 'pnl' }));
portfolioRoutes.get('/history', (c) => c.json({ status: 'ok', module: 'portfolio', action: 'history' }));
