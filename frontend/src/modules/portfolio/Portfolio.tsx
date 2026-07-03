import { useQuery } from '@tanstack/react-query'
import {
  Briefcase, TrendingUp, TrendingDown,
  X, Clock,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── Helpers ── */

function pnlColor(val: number): string {
  if (val > 0) return 'var(--kt-up)'
  if (val < 0) return 'var(--kt-dn)'
  return 'var(--kt-muted)'
}

function pnlBg(val: number): string {
  if (val > 0) return 'rgba(34,197,94,.08)'
  if (val < 0) return 'rgba(239,68,68,.08)'
  return 'rgba(148,163,184,.04)'
}

function formatDate(d: string | number | Date | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/* ═══════════════════════════════════════════════════════════════════
   PORTFOLIO PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function Portfolio() {
  /* ── Queries ── */
  const { data: pnl } = useQuery<any>({
    queryKey: ['portfolio-pnl'],
    queryFn: () => api('/api/portfolio/pnl'),
    staleTime: 30_000,
    refetchInterval: 15_000,
    retry: false,
  })

  const { data: positions = [] } = useQuery<any[]>({
    queryKey: ['portfolio-positions'],
    queryFn: () => api('/api/portfolio/positions'),
    refetchInterval: 5_000,
    retry: false,
  })

  const { data: history = [] } = useQuery<any[]>({
    queryKey: ['portfolio-history'],
    queryFn: () => api('/api/portfolio/history'),
    staleTime: 60_000,
    retry: false,
  })

  const activeCount = positions.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Briefcase size={20} style={{ color: 'var(--kt-gold)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>Trade Manager</h1>
        </div>
        {activeCount > 0 && (
          <span style={{
            padding: '3px 10px', borderRadius: 4,
            fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)',
            background: 'rgba(245,158,11,.12)', color: 'var(--kt-gold)',
          }}>
            {activeCount} Active
          </span>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          TOP: P&L Summary Cards
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>

        {/* Total P&L */}
        <div className="kt-card kt-card-pad" style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          background: pnlBg(pnl?.total ?? 0),
        }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Total P&L</span>
          <span style={{
            fontSize: 'var(--lg)', fontWeight: 800, fontFamily: 'var(--font-mono)',
            color: pnlColor(pnl?.total ?? 0),
          }}>
            {(pnl?.total ?? 0) >= 0 ? '+' : ''}{(pnl?.total ?? 0).toFixed(2)}
          </span>
        </div>

        {/* Today P&L */}
        <div className="kt-card kt-card-pad" style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          background: pnlBg(pnl?.today ?? 0),
        }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Today P&L</span>
          <span style={{
            fontSize: 'var(--lg)', fontWeight: 800, fontFamily: 'var(--font-mono)',
            color: pnlColor(pnl?.today ?? 0),
          }}>
            {(pnl?.today ?? 0) >= 0 ? '+' : ''}{(pnl?.today ?? 0).toFixed(2)}
          </span>
        </div>

        {/* Week P&L */}
        <div className="kt-card kt-card-pad" style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          background: pnlBg(pnl?.week ?? 0),
        }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Week P&L</span>
          <span style={{
            fontSize: 'var(--lg)', fontWeight: 800, fontFamily: 'var(--font-mono)',
            color: pnlColor(pnl?.week ?? 0),
          }}>
            {(pnl?.week ?? 0) >= 0 ? '+' : ''}{(pnl?.week ?? 0).toFixed(2)}
          </span>
        </div>

        {/* Win Rate */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Win Rate</span>
          <span style={{ fontSize: 'var(--lg)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
            {pnl?.winRate != null ? `${pnl.winRate}%` : '—'}
          </span>
        </div>

        {/* Avg R:R */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Avg R:R</span>
          <span style={{ fontSize: 'var(--lg)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
            {pnl?.avgRR != null ? `${pnl.avgRR}` : '—'}
          </span>
        </div>

        {/* Total Trades */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Total Trades</span>
          <span style={{ fontSize: 'var(--lg)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
            {pnl?.totalTrades ?? '—'}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          MIDDLE: Open Positions Table
          ═══════════════════════════════════════════════════ */}
      <div className="kt-card kt-card-pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Briefcase size={16} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Open Positions</span>
          <span style={{
            marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
            fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)',
            background: 'rgba(245,158,11,.12)', color: 'var(--kt-gold)',
          }}>
            {activeCount}
          </span>
        </div>

        {activeCount === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', margin: 0 }}>No open positions</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Direction</th>
                  <th>Entry</th>
                  <th>Current</th>
                  <th>SL</th>
                  <th>TP1</th>
                  <th>TP2</th>
                  <th>Lot Size</th>
                  <th>P&L</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos: any) => {
                  const currentPrice = pos.current_price ?? pos.currentPrice ?? 0
                  const entry = pos.entry_price ?? pos.entryPrice ?? 0
                  const dir = pos.direction?.toLowerCase() ?? 'long'
                  const pnlVal = dir === 'long'
                    ? (currentPrice - entry) * (pos.lot_size ?? pos.lotSize ?? 0) * 100
                    : (entry - currentPrice) * (pos.lot_size ?? pos.lotSize ?? 0) * 100

                  return (
                    <tr key={pos.id ?? pos.symbol}>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{pos.symbol}</td>
                      <td>
                        <span className={dir === 'long' ? 'badge-bull' : 'badge-bear'} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          {dir === 'long' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {dir.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{entry}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{currentPrice}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>
                        {pos.sl ?? pos.stopLoss ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                        {pos.tp1 ?? pos.tp1Price ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                        {pos.tp2 ?? pos.tp2Price ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {pos.lot_size ?? pos.lotSize ?? '—'}
                      </td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: pnlColor(pnlVal),
                      }}>
                        {pnlVal >= 0 ? '+' : ''}{pnlVal.toFixed(2)}
                      </td>
                      <td>
                        <button style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 4,
                          fontSize: 'var(--xs)', fontWeight: 600,
                          background: 'rgba(239,68,68,.10)', color: 'var(--kt-dn)',
                          border: '1px solid rgba(239,68,68,.25)',
                          cursor: 'pointer',
                        }}>
                          <X size={10} /> Close
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          BOTTOM: Trade History
          ═══════════════════════════════════════════════════ */}
      <div className="kt-card kt-card-pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Clock size={16} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Trade History</span>
          <span style={{
            marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
            fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)',
            background: 'rgba(148,163,184,.08)', color: 'var(--kt-muted)',
          }}>
            {history.length}
          </span>
        </div>

        {history.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', margin: 0 }}>No trade history</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Direction</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>SL</th>
                  <th>TP1</th>
                  <th>TP2</th>
                  <th>Lot Size</th>
                  <th>P&L</th>
                  <th>Closed At</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((trade: any) => {
                  const dir = trade.direction?.toLowerCase() ?? 'long'
                  const pnlVal = trade.current_pnl ?? trade.pnl ?? 0

                  return (
                    <tr key={trade.id ?? Math.random()}>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{trade.symbol}</td>
                      <td>
                        <span className={dir === 'long' ? 'badge-bull' : 'badge-bear'} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          {dir === 'long' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {dir.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{trade.entry_price ?? trade.entryPrice ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{trade.exit_price ?? trade.exitPrice ?? trade.current_price ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>
                        {trade.sl ?? trade.stopLoss ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                        {trade.tp1 ?? trade.tp1Price ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                        {trade.tp2 ?? trade.tp2Price ?? '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {trade.lot_size ?? trade.lotSize ?? '—'}
                      </td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: pnlColor(pnlVal),
                      }}>
                        {pnlVal >= 0 ? '+' : ''}{Number(pnlVal).toFixed(2)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>
                        {formatDate(trade.closed_at ?? trade.closedAt ?? trade.updated_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
