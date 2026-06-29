import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const portfolioRoutes = new Hono<{ Bindings: Bindings }>();

// Helper: fetch current price from Yahoo
async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AegisTerminal/1.0' } });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch { return null; }
}

// GET /api/portfolio/positions — list all positions
portfolioRoutes.get('/positions', async (c) => {
  const db = c.env.DB;
  try {
    const { results } = await db.prepare(
      'SELECT * FROM positions ORDER BY created_at DESC'
    ).all();
    return c.json({ status: 'ok', data: results });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /api/portfolio/positions — create position
portfolioRoutes.post('/positions', async (c) => {
  const db = c.env.DB;
  try {
    const body = await c.req.json();
    const { symbol, side, quantity, entry_price, notes } = body;
    if (!symbol || !quantity || !entry_price) {
      return c.json({ error: 'symbol, quantity, entry_price required' }, 400);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO positions (id, symbol, side, quantity, entry_price, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, symbol.toUpperCase(), side ?? 'long', quantity, entry_price, notes ?? '', 'open', now, now).run();

    const { results } = await db.prepare('SELECT * FROM positions WHERE id = ?').bind(id).all();
    return c.json({ status: 'ok', data: results[0] }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// PUT /api/portfolio/positions/:id — update position
portfolioRoutes.put('/positions/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const fields: string[] = [];
    const values: any[] = [];
    for (const key of ['symbol', 'side', 'quantity', 'entry_price', 'exit_price', 'status', 'notes']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'symbol' ? body[key].toUpperCase() : body[key]);
      }
    }
    if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await db.prepare(`UPDATE positions SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    const { results } = await db.prepare('SELECT * FROM positions WHERE id = ?').bind(id).all();
    if (!results.length) return c.json({ error: 'Not found' }, 404);
    return c.json({ status: 'ok', data: results[0] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /api/portfolio/positions/:id — delete position
portfolioRoutes.delete('/positions/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  try {
    await db.prepare('DELETE FROM positions WHERE id = ?').bind(id).run();
    return c.json({ status: 'ok', deleted: id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/portfolio/pnl — live P&L with current prices
portfolioRoutes.get('/pnl', async (c) => {
  const db = c.env.DB;
  const cache = new Cache(c.env.AEGIS_CACHE, 60);

  try {
    const { results } = await db.prepare(
      "SELECT * FROM positions WHERE status = 'open'"
    ).all();

    const positions = [];
    let totalPnl = 0;
    let totalCost = 0;
    let totalValue = 0;

    for (const pos of results as any[]) {
      const price = await cache.getOrSet(
        `px:${pos.symbol}`,
        () => fetchPrice(pos.symbol),
        { ttl: 60 }
      );
      const currentPrice = price ?? pos.entry_price;
      const cost = pos.entry_price * pos.quantity;
      const value = currentPrice * pos.quantity;
      const pnl = pos.side === 'short'
        ? (pos.entry_price - currentPrice) * pos.quantity
        : (currentPrice - pos.entry_price) * pos.quantity;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;

      totalCost += cost;
      totalValue += value;
      totalPnl += pnl;

      positions.push({
        ...pos,
        currentPrice,
        value,
        pnl: Math.round(pnl * 100) / 100,
        pnlPct: Math.round(pnlPct * 100) / 100,
      });
    }

    return c.json({
      status: 'ok',
      summary: {
        totalPositions: positions.length,
        totalCost: Math.round(totalCost * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        totalPnlPct: totalCost > 0 ? Math.round((totalPnl / totalCost) * 10000) / 100 : 0,
      },
      data: positions,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/portfolio/history — closed positions
portfolioRoutes.get('/history', async (c) => {
  const db = c.env.DB;
  try {
    const { results } = await db.prepare(
      "SELECT * FROM positions WHERE status = 'closed' ORDER BY updated_at DESC LIMIT 100"
    ).all();

    const history = (results as any[]).map(pos => {
      const pnl = pos.exit_price != null
        ? (pos.side === 'short'
          ? (pos.entry_price - pos.exit_price) * pos.quantity
          : (pos.exit_price - pos.entry_price) * pos.quantity)
        : null;
      const cost = pos.entry_price * pos.quantity;
      return { ...pos, pnl, pnlPct: cost > 0 && pnl != null ? Math.round((pnl / cost) * 10000) / 100 : null };
    });

    const totalRealized = history.reduce((s: number, h: any) => s + (h.pnl ?? 0), 0);

    return c.json({
      status: 'ok',
      summary: { closedPositions: history.length, totalRealized: Math.round(totalRealized * 100) / 100 },
      data: history,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /api/portfolio/close/:id — close a position with exit price
portfolioRoutes.post('/close/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const exitPrice = body.exit_price;
    if (!exitPrice) return c.json({ error: 'exit_price required' }, 400);

    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE positions SET status = 'closed', exit_price = ?, updated_at = ? WHERE id = ?"
    ).bind(exitPrice, now, id).run();

    const { results } = await db.prepare('SELECT * FROM positions WHERE id = ?').bind(id).all();
    if (!results.length) return c.json({ error: 'Not found' }, 404);
    return c.json({ status: 'ok', data: results[0] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
