import { Hono } from 'hono';

export const journalRoutes = new Hono();

journalRoutes.get('/', (c) => c.json({ status: 'ok', module: 'journal' }));
journalRoutes.post('/entry', (c) => c.json({ status: 'ok', module: 'journal', action: 'create_entry' }));
journalRoutes.get('/entries', (c) => c.json({ status: 'ok', module: 'journal', action: 'list_entries' }));
