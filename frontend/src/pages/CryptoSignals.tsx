import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Zap, TrendingUp, TrendingDown, History } from 'lucide-react'
import { api } from '../lib/api'

/* ── Helpers ── */

function biasColor(bias: string): string {
  if (bias === 'bullish') return 'var(--kt-up)'
  if (bias === 'bearish') return 'var(--kt-dn)'
  return 'var(--kt-muted)'
}

function biasIcon(bias: string) {
  if (bias === 'bullish') return <TrendingUp size={10} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={10} style={{ color: 'var(--kt-dn)' }} />
  return null
}

function formatPrice(price: any): string {
  if (!price) return '—'
  const p = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(p)) return '—'
  if (p >= 1000) return p.toFixed(2)
  if (p >= 1) return p.toFixed(4)
  if (p >= 0.01) return p.toFixed(6)
  return p.toFixed(8)
}

function formatPnl(pnl: any): string {
  if (pnl === null || pnl === undefined) return '—'
  const p = typeof pnl === 'string' ? parseFloat(pnl) : pnl
  if (isNaN(p)) return '—'
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(2)}%`
}

/* ═══════════════════════════════════════════════════════════════════
   CRYPTO SIGNALS PAGE
   ═══════════════════════════════════════════════════════════════════ */

interface Signal {
  id: number
  symbol: string
  timeframe: string
  bias: string
  confidence: number
  price: number | string
  entry_price: number | string
  stop_loss: number | string
  take_profit: number | string
  risk_reward: number
  confluence_score: number
  reasoning: string
  setups: Array<any>
  status: string
  hit_tp: boolean
  hit_sl: boolean
  closed_at: string
  exit_price: number | string
  pnl_pct: number
  created_at: string
}

interface SignalStats {
  total: number
  active: number
  hit_tp: number
  hit_sl: number
  win_rate: number
  avg_pnl: number
  by_bias: Array<{ bias: string; count: number; avg_confidence: number }>
}

export function CryptoSignals() {
  const [tab, setTab] = useState<'active' | 'history'>('active')

  const { data: activeData, isLoading: activeLoading } = useQuery<any>({
    queryKey: ['crypto-signals'],
    queryFn: () => api('/api/crypto/signals?limit=50'),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: historyData, isLoading: historyLoading } = useQuery<any>({
    queryKey: ['crypto-signals-history'],
    queryFn: () => api('/api/crypto/signals/history?limit=50'),
    staleTime: 60_000,
    enabled: tab === 'history',
    retry: false,
  })

  const { data: statsData } = useQuery<any>({
    queryKey: ['crypto-signals-stats'],
    queryFn: () => api('/api/crypto/signals/stats'),
    staleTime: 60_000,
    retry: false,
  })

  const signals: Signal[] = activeData?.signals || []
  const history: Signal[] = historyData?.history || []
  const stats: SignalStats | null = statsData?.stats || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={20} style={{ color: 'var(--kt-gold)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>
            Crypto Signals
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setTab('active')}
            style={{
              padding: '6px 14px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 700, cursor: 'pointer', border: 'none',
              background: tab === 'active' ? 'rgba(245,158,11,.15)' : 'transparent',
              color: tab === 'active' ? 'var(--kt-gold)' : 'var(--kt-muted)',
            }}
          >
            Active ({signals.length})
          </button>
          <button
            onClick={() => setTab('history')}
            style={{
              padding: '6px 14px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 700, cursor: 'pointer', border: 'none',
              background: tab === 'history' ? 'rgba(245,158,11,.15)' : 'transparent',
              color: tab === 'history' ? 'var(--kt-gold)' : 'var(--kt-muted)',
            }}
          >
            <History size={12} style={{ marginRight: 4 }} />
            History ({history.length})
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <div className="kt-card kt-card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>Total</div>
            <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>{stats.total}</div>
          </div>
          <div className="kt-card kt-card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>Active</div>
            <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-gold)' }}>{stats.active}</div>
          </div>
          <div className="kt-card kt-card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>Win Rate</div>
            <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: stats.win_rate >= 50 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>{stats.win_rate}%</div>
          </div>
          <div className="kt-card kt-card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>TP Hit</div>
            <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>{stats.hit_tp}</div>
          </div>
          <div className="kt-card kt-card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>SL Hit</div>
            <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>{stats.hit_sl}</div>
          </div>
        </div>
      )}

      {/* Active Signals Tab */}
      {tab === 'active' && (
        <>
          {activeLoading ? (
            <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
              Loading...
            </div>
          ) : signals.length === 0 ? (
            <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
              No active signals. Run scan: `node scan-all.js`
            </div>
          ) : (
            <div className="kt-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="kt-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Bias</th>
                      <th>Conf</th>
                      <th>Price</th>
                      <th>Entry</th>
                      <th>SL</th>
                      <th>TP</th>
                      <th>R:R</th>
                      <th>Layers</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map(signal => (
                      <tr key={signal.id}>
                        <td>
                          <Link to={`/crypto/${signal.symbol}`} style={{ color: 'var(--kt-gold)', fontWeight: 600, textDecoration: 'none' }}>
                            {signal.symbol}
                          </Link>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)', background: signal.bias === 'bullish' ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', color: biasColor(signal.bias) }}>
                            {biasIcon(signal.bias)}
                            {signal.bias.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: biasColor(signal.bias) }}>
                          {signal.confidence || signal.confluence_score}%
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          ${formatPrice(signal.price)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-gold)' }}>
                          ${formatPrice(signal.entry_price)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>
                          ${formatPrice(signal.stop_loss)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                          ${formatPrice(signal.take_profit)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {signal.risk_reward ? `${signal.risk_reward}:1` : '—'}
                        </td>
                        <td style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>
                          {signal.reasoning?.match(/(\d+)\/3 layers agree/)?.[0] || '—'}
                        </td>
                        <td style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>
                          {new Date(signal.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <>
          {historyLoading ? (
            <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
              Loading...
            </div>
          ) : history.length === 0 ? (
            <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
              No closed signals yet. Signals will appear here after hitting TP/SL or expiring.
            </div>
          ) : (
            <div className="kt-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="kt-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Bias</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>PnL</th>
                      <th>Result</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(signal => {
                      const duration = signal.closed_at
                        ? Math.round((new Date(signal.closed_at).getTime() - new Date(signal.created_at).getTime()) / 60000)
                        : 0
                      const result = signal.hit_tp ? 'TP HIT' : signal.hit_sl ? 'SL HIT' : 'EXPIRED'
                      const resultColor = signal.hit_tp ? 'var(--kt-up)' : signal.hit_sl ? 'var(--kt-dn)' : 'var(--kt-muted)'

                      return (
                        <tr key={signal.id}>
                          <td style={{ fontWeight: 600, color: 'var(--kt-gold)' }}>{signal.symbol}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)', background: signal.bias === 'bullish' ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', color: biasColor(signal.bias) }}>
                              {biasIcon(signal.bias)}
                              {signal.bias.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>${formatPrice(signal.entry_price)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>${formatPrice(signal.exit_price)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: (signal.pnl_pct || 0) >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                            {formatPnl(signal.pnl_pct)}
                          </td>
                          <td style={{ fontWeight: 700, color: resultColor, fontSize: 'var(--xs)' }}>
                            {result}
                          </td>
                          <td style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>
                            {duration > 1440 ? `${Math.round(duration / 1440)}d` : duration > 60 ? `${Math.round(duration / 60)}h` : `${duration}m`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
