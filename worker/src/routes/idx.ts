import { Hono } from 'hono';

export const idxRoutes = new Hono();

idxRoutes.get('/', (c) => c.json({ status: 'ok', module: 'idx' }));
idxRoutes.get('/components', (c) => c.json({ status: 'ok', module: 'idx', action: 'components' }));
idxRoutes.get('/performance', (c) => c.json({ status: 'ok', module: 'idx', action: 'performance' }));
