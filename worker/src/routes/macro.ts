import { Hono } from 'hono';

export const macroRoutes = new Hono();

macroRoutes.get('/', (c) => c.json({ status: 'ok', module: 'macro' }));
macroRoutes.get('/indicators', (c) => c.json({ status: 'ok', module: 'macro', action: 'indicators' }));
macroRoutes.get('/calendar', (c) => c.json({ status: 'ok', module: 'macro', action: 'calendar' }));
