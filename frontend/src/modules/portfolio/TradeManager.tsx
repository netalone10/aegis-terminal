import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Minus, ChevronDown, X } from 'lucide-react'

interface Trade {
  id: number;
  symbol: string;
  direction: string;
  entry_price: number;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  lot_size: number;
  status: string;
  current_pnl: number;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  close_price: number | null;
}

const emptyForm = { symbol: '', direction: 'long', entry_price: '', sl: '', tp1: '', tp2: '', lot_size: '1', notes: '' };

export default function TradeManager() {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const { data: trades = [] } = useQuery<Trade[]>({
    queryKey: ['trades'],
    queryFn: () => api('/api/trades'),
    refetchInterval: 15000,
  });

  // Fetch live prices for active trades from /api/forex/ticker
  useEffect(() => {
    const active = trades.filter((t) => t.status === 'active');
    if (!active.length) return;
    const fetchPrices = async () => {
      try {
        const ticker = await api<any[]>('/api/forex/ticker');
        const map: Record<string, number> = {};
        if (Array.isArray(ticker)) {
          for (const item of ticker) {
            if (item.symbol && item.price) {
              map[item.symbol] = item.price;
              const normalized = item.symbol.replace('/', '');
              map[normalized] = item.price;
            }
          }
        }
        setPrices(map);
      } catch {}
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 20000);
    return () => clearInterval(iv);
  }, [trades]);

  const createMut = useMutation({
    mutationFn: (data: any) => api('/api/trades', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trades'] }); setForm(emptyForm); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      api(`/api/trades/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/trades/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.symbol || !form.entry_price) return;
    createMut.mutate({
      symbol: form.symbol,
      direction: form.direction,
      entry_price: parseFloat(form.entry_price),
      sl: form.sl ? parseFloat(form.sl) : null,
      tp1: form.tp1 ? parseFloat(form.tp1) : null,
      tp2: form.tp2 ? parseFloat(form.tp2) : null,
      lot_size: parseFloat(form.lot_size) || 1,
      notes: form.notes || null,
    });
  };

  const getLivePnl = (t: Trade) => {
    const price = prices[t.symbol] ?? t.entry_price;
    const diff = t.direction === 'long' ? price - t.entry_price : t.entry_price - price;
    return Math.round(diff * t.lot_size * 100 * 100) / 100;
  };

  const activeTrades = trades.filter((t) => t.status === 'active');
  const closedTrades = trades.filter((t) => t.status === 'closed');

  // Stats
  const wins = closedTrades.filter((t) => (t.current_pnl ?? 0) > 0);
  const losses = closedTrades.filter((t) => (t.current_pnl ?? 0) < 0);
  const totalPnl = closedTrades.reduce((s, t) => s + (t.current_pnl ?? 0), 0);
  const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
  const grossWin = wins.reduce((s, t) => s + (t.current_pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.current_pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? Infinity : 0;

  // Avg R:R — approximate using entry/sl/tp1
  const rrTrades = closedTrades.filter((t) => t.sl && t.tp1);
  const avgRR = rrTrades.length > 0
    ? Math.round(rrTrades.reduce((s, t) => {
        const risk = Math.abs(t.entry_price - (t.sl ?? t.entry_price));
        const reward = Math.abs((t.tp1 ?? t.entry_price) - t.entry_price);
        return s + (risk > 0 ? reward / risk : 0);
      }, 0) / rrTrades.length * 100) / 100
    : 0;

  // Equity curve data
  const cumPnl: number[] = [];
  let cum = 0;
  for (const t of [...closedTrades].reverse()) {
    cum += t.current_pnl ?? 0;
    cumPnl.push(Math.round(cum * 100) / 100);
  }
  const maxCum = Math.max(...(cumPnl.length ? cumPnl : [0]), 0);
  const minCum = Math.min(...(cumPnl.length ? cumPnl : [0]), 0);
  const range = maxCum - minCum || 1;

  const getOutcome = (t: Trade) => {
    if ((t.current_pnl ?? 0) > 0) return 'WIN';
    if ((t.current_pnl ?? 0) < 0) return 'LOSS';
    return 'BE';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--md)' }}>
      {/* Stats Summary */}
      <div className="kt-grid-4">
        <div className="kt-stat"><span className="kt-kicker">TOTAL TRADES</span><span style={{ fontSize: 'var(--md)' }}>{closedTrades.length + activeTrades.length}</span></div>
        <div className="kt-stat"><span className="kt-kicker">WIN RATE</span><span style={{ fontSize: 'var(--md)', color: winRate >= 50 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>{winRate}%</span></div>
        <div className="kt-stat"><span className="kt-kicker">AVG R:R</span><span style={{ fontSize: 'var(--md)' }}>{avgRR || '—'}</span></div>
        <div className="kt-stat"><span className="kt-kicker">PROFIT FACTOR</span><span style={{ fontSize: 'var(--md)', color: profitFactor >= 1 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>{profitFactor === Infinity ? '∞' : profitFactor}</span></div>
      </div>

      <div className="kt-grid-2" style={{ alignItems: 'start' }}>
        {/* New Trade Form */}
        <div className="kt-card kt-card-pad">
          <h3 style={{ margin: '0 0 var(--sm)', fontSize: 'var(--sm)', color: 'var(--kt-gold)' }}>+ NEW TRADE</h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input className="kt-input" placeholder="Symbol (BTCUSDT)" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required />
              <select className="kt-input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input className="kt-input" type="number" step="any" placeholder="Entry Price" value={form.entry_price} onChange={(e) => setForm({ ...form, entry_price: e.target.value })} required />
              <input className="kt-input" type="number" step="any" placeholder="Lot Size" value={form.lot_size} onChange={(e) => setForm({ ...form, lot_size: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <input className="kt-input" type="number" step="any" placeholder="Stop Loss" value={form.sl} onChange={(e) => setForm({ ...form, sl: e.target.value })} />
              <input className="kt-input" type="number" step="any" placeholder="TP1" value={form.tp1} onChange={(e) => setForm({ ...form, tp1: e.target.value })} />
              <input className="kt-input" type="number" step="any" placeholder="TP2" value={form.tp2} onChange={(e) => setForm({ ...form, tp2: e.target.value })} />
            </div>
            <input className="kt-input" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button type="submit" className="kt-btn" style={{ background: 'var(--kt-gold)', color: 'var(--kt-bg)', fontWeight: 600, padding: '8px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {createMut.isPending ? 'Opening...' : 'Open Trade'}
            </button>
          </form>
        </div>

        {/* Equity Curve */}
        <div className="kt-card kt-card-pad">
          <h3 style={{ margin: '0 0 var(--sm)', fontSize: 'var(--sm)', color: 'var(--kt-gold)' }}>EQUITY CURVE</h3>
          <div style={{ display: 'flex', alignItems: 'end', gap: '2px', height: '120px', padding: '0 0 var(--xs)' }}>
            {cumPnl.length === 0 && <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>No closed trades yet</span>}
            {cumPnl.map((v, i) => {
              const pct = ((v - minCum) / range) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'end', height: '100%' }}>
                  <div style={{
                    width: '100%',
                    maxWidth: '16px',
                    height: `${Math.max(4, pct)}%`,
                    background: v >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)',
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.3s',
                  }} title={`${v}`} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
            <span>{closedTrades.length} trades</span>
            <span style={{ color: totalPnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>Total: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Active Trades */}
      <div className="kt-card kt-card-pad">
        <h3 style={{ margin: '0 0 var(--sm)', fontSize: 'var(--sm)', color: 'var(--kt-gold)' }}>
          <span className="kt-status-dot" /> ACTIVE TRADES ({activeTrades.length})
        </h3>
        {activeTrades.length === 0 ? (
          <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>No active trades</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Dir</th>
                  <th>Entry</th>
                  <th>SL</th>
                  <th>TP1</th>
                  <th>Lots</th>
                  <th>Live P&L</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeTrades.map((t) => {
                  const pnl = getLivePnl(t);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                      <td><span className={t.direction === 'long' ? 'badge-bull' : 'badge-bear'}>{t.direction.toUpperCase()}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{t.entry_price}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>{t.sl ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>{t.tp1 ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{t.lot_size}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)', fontWeight: 600 }}>
                        {pnl >= 0 ? '+' : ''}{pnl}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="kt-btn-sm" title="Move SL to Breakeven" onClick={() => updateMut.mutate({ id: t.id, body: { action: 'breakeven' } })}
                            style={{ background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)', color: 'var(--kt-text)', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: 'var(--xs)' }}>
                            <Minus size={12} />
                          </button>
                          <button className="kt-btn-sm" title="Partial Close (50%)" onClick={() => updateMut.mutate({ id: t.id, body: { action: 'partial_close' } })}
                            style={{ background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)', color: 'var(--kt-text)', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: 'var(--xs)' }}>
                            <ChevronDown size={12} />
                          </button>
                          <button className="kt-btn-sm" title="Close Trade" onClick={() => {
                            const price = prices[t.symbol] ?? t.entry_price;
                            updateMut.mutate({ id: t.id, body: { action: 'close', close_price: price } });
                          }}
                            style={{ background: 'var(--kt-dn)', border: 'none', color: '#fff', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: 'var(--xs)' }}>
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade History */}
      <div className="kt-card kt-card-pad">
        <h3 style={{ margin: '0 0 var(--sm)', fontSize: 'var(--sm)', color: 'var(--kt-gold)' }}>TRADE HISTORY ({closedTrades.length})</h3>
        {closedTrades.length === 0 ? (
          <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>No closed trades</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Dir</th>
                  <th>Entry</th>
                  <th>Close</th>
                  <th>Outcome</th>
                  <th>P&L</th>
                  <th>Closed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map((t) => {
                  const outcome = getOutcome(t);
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                      <td><span className={t.direction === 'long' ? 'badge-bull' : 'badge-bear'}>{t.direction.toUpperCase()}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{t.entry_price}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{t.close_price ?? '—'}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: '3px', fontSize: 'var(--xs)', fontWeight: 600,
                          background: outcome === 'WIN' ? 'rgba(0,200,120,0.15)' : outcome === 'LOSS' ? 'rgba(255,60,60,0.15)' : 'rgba(255,255,255,0.08)',
                          color: outcome === 'WIN' ? 'var(--kt-up)' : outcome === 'LOSS' ? 'var(--kt-dn)' : 'var(--kt-muted)',
                        }}>
                          {outcome}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: (t.current_pnl ?? 0) >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)', fontWeight: 600 }}>
                        {(t.current_pnl ?? 0) >= 0 ? '+' : ''}{t.current_pnl?.toFixed(2)}
                      </td>
                      <td style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                        {t.closed_at ? new Date(t.closed_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <button onClick={() => deleteMut.mutate(t.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--kt-muted)', cursor: 'pointer', padding: '2px' }}>
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
