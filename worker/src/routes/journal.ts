import { Hono } from 'hono';
import type { Bindings } from '../index';

export const journalRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/journal/entries — list entries with optional filters
journalRoutes.get('/entries', async (c) => {
  const db = c.env.DB;
  const symbol = c.req.query('symbol');
  const tag = c.req.query('tag');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    let sql = 'SELECT * FROM journal WHERE 1=1';
    const params: any[] = [];
    if (symbol) { sql += ' AND symbol = ?'; params.push(symbol.toUpperCase()); }
    if (tag) { sql += ' AND tags LIKE ?'; params.push(`%${tag}%`); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await db.prepare(sql).bind(...params).all();
    const countSql = 'SELECT COUNT(*) as total FROM journal';
    const countResult = await db.prepare(countSql).first();

    return c.json({ status: 'ok', total: (countResult as any)?.total ?? 0, data: results });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /api/journal/entries — create entry
journalRoutes.post('/entries', async (c) => {
  const db = c.env.DB;
  try {
    const body = await c.req.json();
    const { symbol, direction, entry_price, exit_price, pnl, setup, emotion, tags, notes, lesson } = body;
    if (!symbol || !notes) {
      return c.json({ error: 'symbol and notes required' }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO journal (id, symbol, direction, entry_price, exit_price, pnl, setup, emotion, tags, notes, lesson, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, symbol.toUpperCase(), direction ?? null, entry_price ?? null,
      exit_price ?? null, pnl ?? null, setup ?? null, emotion ?? null,
      tags ?? null, notes, lesson ?? null, now, now
    ).run();

    const { results } = await db.prepare('SELECT * FROM journal WHERE id = ?').bind(id).all();
    return c.json({ status: 'ok', data: results[0] }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// PUT /api/journal/entries/:id — update entry
journalRoutes.put('/entries/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['symbol', 'direction', 'entry_price', 'exit_price', 'pnl', 'setup', 'emotion', 'tags', 'notes', 'lesson'];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'symbol' ? body[key].toUpperCase() : body[key]);
      }
    }
    if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await db.prepare(`UPDATE journal SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    const { results } = await db.prepare('SELECT * FROM journal WHERE id = ?').bind(id).all();
    if (!results.length) return c.json({ error: 'Not found' }, 404);
    return c.json({ status: 'ok', data: results[0] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /api/journal/entries/:id — delete entry
journalRoutes.delete('/entries/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  try {
    await db.prepare('DELETE FROM journal WHERE id = ?').bind(id).run();
    return c.json({ status: 'ok', deleted: id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/journal/stats — journal statistics
journalRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  try {
    const total = await db.prepare('SELECT COUNT(*) as count FROM journal').first();
    const wins = await db.prepare("SELECT COUNT(*) as count FROM journal WHERE pnl > 0").first();
    const losses = await db.prepare("SELECT COUNT(*) as count FROM journal WHERE pnl < 0").first();
    const totalPnl = await db.prepare("SELECT SUM(pnl) as total FROM journal WHERE pnl IS NOT NULL").first();
    const avgPnl = await db.prepare("SELECT AVG(pnl) as avg FROM journal WHERE pnl IS NOT NULL").first();
    const bestTrade = await db.prepare("SELECT MAX(pnl) as max FROM journal WHERE pnl IS NOT NULL").first();
    const worstTrade = await db.prepare("SELECT MIN(pnl) as min FROM journal WHERE pnl IS NOT NULL").first();

    // Win rate by setup
    const bySetup = await db.prepare(
      "SELECT setup, COUNT(*) as trades, SUM(pnl) as totalPnl, AVG(pnl) as avgPnl FROM journal WHERE pnl IS NOT NULL AND setup IS NOT NULL GROUP BY setup ORDER BY totalPnl DESC"
    ).all();

    // Win rate by emotion
    const byEmotion = await db.prepare(
      "SELECT emotion, COUNT(*) as trades, SUM(pnl) as totalPnl, AVG(pnl) as avgPnl FROM journal WHERE pnl IS NOT NULL AND emotion IS NOT NULL GROUP BY emotion ORDER BY totalPnl DESC"
    ).all();

    // Recent streak
    const recent = await db.prepare(
      "SELECT pnl FROM journal WHERE pnl IS NOT NULL ORDER BY created_at DESC LIMIT 20"
    ).all();
    const recentPnls = (recent.results as any[]).map(r => r.pnl);
    let streak = 0;
    let streakType = 'none';
    for (const p of recentPnls) {
      if (streak === 0) { streak = 1; streakType = p >= 0 ? 'win' : 'loss'; continue; }
      if ((streakType === 'win' && p >= 0) || (streakType === 'loss' && p < 0)) { streak++; }
      else break;
    }

    const winCount = (wins as any)?.count ?? 0;
    const lossCount = (losses as any)?.count ?? 0;
    const totalTrades = (total as any)?.count ?? 0;

    return c.json({
      status: 'ok',
      stats: {
        totalTrades,
        wins: winCount,
        losses: lossCount,
        winRate: totalTrades > 0 ? Math.round((winCount / totalTrades) * 10000) / 100 : 0,
        totalPnl: Math.round(((totalPnl as any)?.total ?? 0) * 100) / 100,
        avgPnl: Math.round(((avgPnl as any)?.avg ?? 0) * 100) / 100,
        bestTrade: (bestTrade as any)?.max ?? 0,
        worstTrade: (worstTrade as any)?.min ?? 0,
        profitFactor: lossCount > 0 ? Math.abs(winCount / lossCount) : null,
        currentStreak: { type: streakType, count: streak },
        bySetup: bySetup.results,
        byEmotion: byEmotion.results,
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
