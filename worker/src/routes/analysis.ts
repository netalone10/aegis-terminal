import { Hono } from 'hono';

export const analysisRoutes = new Hono();

analysisRoutes.get('/', (c) => c.json({ status: 'ok', module: 'analysis' }));
analysisRoutes.get('/technical/:symbol', (c) => c.json({ status: 'ok', module: 'analysis', action: 'technical' }));
analysisRoutes.get('/screener', (c) => c.json({ status: 'ok', module: 'analysis', action: 'screener' }));
