import { Hono } from 'hono';
import type { Bindings } from '../index';

export const tradeRoutes = new Hono<{ Bindings: Bindings }>();

// Ensure table exists
async function ensureTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_price REAL NOT NULL,
      sl REAL,
      tp1 REAL,
      tp2 REAL,
      lot_size REAL DEFAULT 1,
      status TEXT DEFAULT 'active',
      current_pnl REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      close_price REAL
    )
  `).run();
}

// POST /api/trades — create trade
tradeRoutes.post('/', async (c) => {
  const db = c.env.DB;
  await ensureTable(db);
  try {
    const body = await c.req.json();
    const { symbol, direction, entry_price, sl, tp1, tp2, lot_size, notes } = body;
    if (!symbol || !direction || entry_price == null) {
      return c.json({ error: 'symbol, direction, entry_price required' }, 400);
    }

    const now = new Date().toISOString();
    const result = await db.prepare(
      `INSERT INTO trades (symbol, direction, entry_price, sl, tp1, tp2, lot_size, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      symbol.toUpperCase(), direction, entry_price,
      sl ?? null, tp1 ?? null, tp2 ?? null,
      lot_size ?? 1, notes ?? null, now
    ).run();
    const id = result.meta.last_row_id;

    const { results } = await db.prepare('SELECT * FROM trades WHERE id = ?').bind(id).all();
    return c.json({ status: 'ok', data: results[0] }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/trades — list all trades
tradeRoutes.get('/', async (c) => {
  const db = c.env.DB;
  await ensureTable(db);
  try {
    const status = c.req.query('status');
    let sql = 'SELECT * FROM trades';
    const params: any[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const { results } = await db.prepare(sql).bind(...params).all();
    return c.json({ status: 'ok', data: results });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// PUT /api/trades/:id — update trade
tradeRoutes.put('/:id', async (c) => {
  const db = c.env.DB;
  await ensureTable(db);
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const existing = await db.prepare('SELECT * FROM trades WHERE id = ?').bind(id).first() as any;
    if (!existing) return c.json({ error: 'Not found' }, 404);

    // Handle actions
    if (body.action === 'close') {
      const closePrice = body.close_price ?? existing.entry_price;
      const pnl = existing.direction === 'long'
        ? (closePrice - existing.entry_price) * (existing.lot_size ?? 1) * 100
        : (existing.entry_price - closePrice) * (existing.lot_size ?? 1) * 100;
      await db.prepare(
        `UPDATE trades SET status = 'closed', close_price = ?, current_pnl = ?, closed_at = ? WHERE id = ?`
      ).bind(closePrice, Math.round(pnl * 100) / 100, new Date().toISOString(), id).run();
    } else if (body.action === 'breakeven') {
      await db.prepare('UPDATE trades SET sl = ? WHERE id = ?').bind(existing.entry_price, id).run();
    } else if (body.action === 'partial_close') {
      const newLot = Math.max(0.01, (existing.lot_size ?? 1) * 0.5);
      await db.prepare('UPDATE trades SET lot_size = ? WHERE id = ?').bind(newLot, id).run();
    } else {
      // Generic field update
      const fields: string[] = [];
      const values: any[] = [];
      const allowed = ['sl', 'tp1', 'tp2', 'lot_size', 'notes', 'current_pnl'];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(body[key]);
        }
      }
      if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
      values.push(id);
      await db.prepare(`UPDATE trades SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    }

    const { results } = await db.prepare('SELECT * FROM trades WHERE id = ?').bind(id).all();
    return c.json({ status: 'ok', data: results[0] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /api/trades/:id
tradeRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  await ensureTable(db);
  const id = c.req.param('id');
  try {
    await db.prepare('DELETE FROM trades WHERE id = ?').bind(id).run();
    return c.json({ status: 'ok', deleted: id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
