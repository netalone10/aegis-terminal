import { Hono } from 'hono';

export const aiRoutes = new Hono();

aiRoutes.get('/', (c) => c.json({ status: 'ok', module: 'ai' }));
aiRoutes.post('/chat', (c) => c.json({ status: 'ok', module: 'ai', action: 'chat' }));
aiRoutes.post('/analyze', (c) => c.json({ status: 'ok', module: 'ai', action: 'analyze' }));
