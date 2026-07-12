import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, Zap, Clock, Target, BarChart3 } from 'lucide-react'
import { api } from '../lib/api'

/* ── Helpers ── */

function fmt(p: any, decimals = 2): string {
  if (!p) return '—'
  const n = typeof p === 'string' ? parseFloat(p) : p
  return isNaN(n) ? '—' : n.toFixed(decimals)
}

function stateBadge(state: string): { bg: string; fg: string; label: string } {
  switch (state) {
    case 'scanning': return { bg: 'rgba(255,191,0,.15)', fg: '#ffbf00', label: 'SCANNING' }
    case 'signal': return { bg: 'rgba(70,201,127,.15)', fg: '#46c97f', label: 'SIGNAL' }
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

function thresholdColor(val: number): string {
  if (val >= 95) return 'var(--kt-up)'
  if (val >= 90) return 'var(--kt-gold)'
  return 'var(--kt-text)'
}

/* ── Stat Card ── */

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
   CRYPTO SIGNAL SCANNER PAGE
   ═══════════════════════════════════════════════════════════════════ */

export function CryptoBotMonitor() {
  const { data: statusData, isLoading } = useQuery<any>({
    queryKey: ['bot-status'],
    queryFn: () => api('/api/bot/status'),
    refetchInterval: 15_000,
    retry: false,
  })

  const status = statusData || {}
  const signals = status.signals || []
  const badge = stateBadge(status.state || 'offline')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={20} style={{ color: 'var(--kt-gold)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>
            Crypto Signal Scanner
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

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <StatCard label="Signals" value={status.count || 0} color="var(--kt-gold)" icon={<Target size={12} />} />
        <StatCard label="Scanned" value="455" icon={<BarChart3 size={12} />} />
        <StatCard label="Threshold" value="≥70%" icon={<TrendingUp size={12} />} />
        <StatCard label="Last Scan" value={status.last_scan ? timeAgo(status.last_scan + ':00').replace('ago', '') : '—'} icon={<Clock size={12} />} />
      </div>

      {/* Signals Table */}
      <div className="kt-card" style={{ overflow: 'hidden' }}>
        <div className="kt-card-pad" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Zap size={14} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontSize: 'var(--md)', fontWeight: 600, color: 'var(--kt-text)' }}>
              Active Signals {signals.length > 0 && <span style={{ color: 'var(--kt-dim)', fontWeight: 400 }}>({signals.length})</span>}
            </span>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--kt-muted)', padding: 30, fontSize: 'var(--sm)' }}>
              Loading...
            </div>
          ) : signals.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--kt-muted)', padding: 30, fontSize: 'var(--sm)' }}>
              No signals found. Next scan in 15 min.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--xs)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--kt-border)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>#</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Symbol</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Price</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Threshold</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Win Prob</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bull / Bear</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-dim)', fontWeight: 500, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Indicators</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s: any, i: number) => (
                    <tr key={s.symbol} style={{ borderBottom: '1px solid var(--kt-border)', background: i === 0 ? 'rgba(70,201,127,.04)' : 'transparent' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--kt-dim)', fontWeight: 500 }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--kt-text)' }}>
                        {s.symbol}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--kt-gold)' }}>
                        ${fmt(s.price, 4)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: thresholdColor(s.threshold) }}>
                        {fmt(s.threshold, 1)}%
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: thresholdColor(s.win_probability) }}>
                        {fmt(s.win_probability, 1)}%
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--kt-up)' }}>{s.bullish}</span>
                        <span style={{ color: 'var(--kt-dim)', margin: '0 4px' }}>/</span>
                        <span style={{ color: 'var(--kt-dn)' }}>{s.bearish}</span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--kt-dim)' }}>
                        {s.total_indicators}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', textAlign: 'center', padding: 8 }}>
        36 indicators across trend, momentum, volatility, and volume. Threshold ≥70%, Win Probability ≥80%.
        Scans every 15 minutes. 455 USDT-M perpetual futures.
      </div>
    </div>
  )
}
