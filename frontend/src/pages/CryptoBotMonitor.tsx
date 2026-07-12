import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, TrendingDown, Zap, Clock, Target, BarChart3 } from 'lucide-react'
import { api } from '../lib/api'

/* ── Helpers (same pattern as other pages) ── */

function fmt(p: any, decimals = 2): string {
  if (!p) return '—'
  const n = typeof p === 'string' ? parseFloat(p) : p
  return isNaN(n) ? '—' : n.toFixed(decimals)
}

function fmtPnl(pnl: any): string {
  if (pnl === null || pnl === undefined) return '—'
  const n = typeof pnl === 'string' ? parseFloat(pnl) : pnl
  return isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function pnlColor(pnl: any): string {
  if (pnl === null || pnl === undefined) return 'var(--kt-muted)'
  const n = typeof pnl === 'string' ? parseFloat(pnl) : pnl
  return n >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)'
}

function stateBadge(state: string): { bg: string; fg: string; label: string } {
  switch (state) {
    case 'scanning': return { bg: 'rgba(255,191,0,.15)', fg: '#ffbf00', label: 'SCANNING' }
    case 'holding': return { bg: 'rgba(70,201,127,.15)', fg: '#46c97f', label: 'HOLDING' }
    case 'entered': return { bg: 'rgba(70,201,127,.15)', fg: '#46c97f', label: 'ENTERED' }
    case 'idle': return { bg: 'rgba(107,114,128,.15)', fg: '#6b7280', label: 'IDLE' }
    case 'no_signal': return { bg: 'rgba(107,114,128,.15)', fg: '#6b7280', label: 'NO SIGNAL' }
    case 'error': return { bg: 'rgba(255,77,79,.15)', fg: '#ff4d4f', label: 'ERROR' }
    case 'offline': return { bg: 'rgba(255,77,79,.15)', fg: '#ff4d4f', label: 'OFFLINE' }
    default: return { bg: 'rgba(107,114,128,.15)', fg: '#6b7280', label: state.toUpperCase() }
  }
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ${min % 60}m ago`
  return `${Math.floor(hr / 24)}d ago`
}

/* ── Stat Card (same pattern as CryptoPerformance) ── */

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="kt-card kt-card-pad" style={{ textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: color || 'var(--kt-text)' }}>
        {value}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CRYPTO BOT MONITOR PAGE
   ═══════════════════════════════════════════════════════════════════ */

export function CryptoBotMonitor() {
  const { data: statusData } = useQuery<any>({
    queryKey: ['bot-status'],
    queryFn: () => api('/api/bot/status'),
    refetchInterval: 10_000,
    retry: false,
  })

  const { data: perfData } = useQuery<any>({
    queryKey: ['bot-performance'],
    queryFn: () => api('/api/bot/performance'),
    staleTime: 60_000,
    retry: false,
  })

  const { data: signalsData } = useQuery<any>({
    queryKey: ['bot-signals'],
    queryFn: () => api('/api/bot/signals?limit=10'),
    staleTime: 30_000,
    retry: false,
  })

  const status = statusData || {}
  const perf = perfData?.performance || {}
  const signals = signalsData?.signals || []
  const badge = stateBadge(status.state || 'offline')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={20} style={{ color: 'var(--kt-gold)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>
            Crypto Bot Monitor
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            background: badge.bg, color: badge.fg, letterSpacing: 0.5,
          }}>
            {badge.label}
          </span>
          {status.updated_at && (
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)', fontFamily: 'var(--font-mono)' }}>
              {timeAgo(status.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Status Card */}
      <div className="kt-card" style={{ overflow: 'hidden' }}>
        <div className="kt-card-pad" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Symbol</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                {status.symbol || '—'}
              </div>
            </div>

            {status.state === 'holding' && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Entry</div>
                  <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--kt-gold)' }}>
                    ${fmt(status.entry_price)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mark</div>
                  <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                    ${fmt(status.mark_price)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>PnL</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: pnlColor(status.unrealised_pnl) }}>
                    {status.unrealised_pnl ? `${status.unrealised_pnl >= 0 ? '+' : ''}${fmt(status.unrealised_pnl)}` : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Leverage</div>
                  <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                    {status.leverage || '—'}x
                  </div>
                </div>
              </>
            )}

            {status.state === 'entered' && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Threshold</div>
                  <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                    {status.threshold?.toFixed(1)}%
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Win Prob</div>
                  <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                    {status.win_probability?.toFixed(1)}%
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Performance Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        <StatCard label="Total" value={perf.total || 0} icon={<Zap size={12} />} />
        <StatCard label="Active" value={perf.active || 0} color="var(--kt-gold)" icon={<Activity size={12} />} />
        <StatCard label="Hit TP" value={perf.hit_tp || 0} color="var(--kt-up)" icon={<TrendingUp size={12} />} />
        <StatCard label="Hit SL" value={perf.hit_sl || 0} color="var(--kt-dn)" icon={<TrendingDown size={12} />} />
        <StatCard label="Avg PnL" value={`${fmt(perf.avg_pnl)}%`} color={pnlColor(perf.avg_pnl)} icon={<BarChart3 size={12} />} />
        <StatCard label="24h PnL" value={`${fmt(perf.total_pnl_24h)}%`} color={pnlColor(perf.total_pnl_24h)} icon={<Clock size={12} />} />
      </div>

      {/* Recent Signals */}
      <div className="kt-card" style={{ overflow: 'hidden' }}>
        <div className="kt-card-pad" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Target size={14} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontSize: 'var(--md)', fontWeight: 600, color: 'var(--kt-text)' }}>Recent Signals</span>
          </div>

          {signals.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--kt-muted)', padding: 20, fontSize: 'var(--sm)' }}>
              No signals yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--xs)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--kt-border)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Symbol</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bias</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Conf</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Entry</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>SL</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>TP</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>PnL</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s: any) => {
                    const sBadge = stateBadge(s.status)
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--kt-border)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--kt-text)' }}>{s.symbol}</td>
                        <td style={{ padding: '10px 12px', color: s.bias === 'bullish' ? 'var(--kt-up)' : 'var(--kt-dn)', fontWeight: 600 }}>
                          {s.bias === 'bullish' ? '🟢 LONG' : '🔴 SHORT'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{s.confidence}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--kt-gold)' }}>${fmt(s.entry_price)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>${fmt(s.stop_loss)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>${fmt(s.take_profit)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: pnlColor(s.pnl_pct) }}>
                          {fmtPnl(s.pnl_pct)}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                            background: sBadge.bg, color: sBadge.fg, letterSpacing: 0.5,
                          }}>
                            {sBadge.label}
                          </span>
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
    </div>
  )
}
