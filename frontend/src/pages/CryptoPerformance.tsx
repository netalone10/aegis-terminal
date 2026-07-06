import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, Target, Clock } from 'lucide-react'
import { api } from '../lib/api'

/* ── Helpers ── */

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="kt-card kt-card-pad" style={{ textAlign: 'center' }}>
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

function WinRateBar({ wins, total }: { wins: number; total: number }) {
  const pct = total > 0 ? Math.round(wins / total * 100) : 0
  const color = pct >= 60 ? 'var(--kt-up)' : pct >= 45 ? 'var(--kt-gold)' : 'var(--kt-dn)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)', fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PERFORMANCE DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */

export function CryptoPerformance() {
  const { data: perfData, isLoading: perfLoading } = useQuery<any>({
    queryKey: ['crypto-performance'],
    queryFn: () => api('/api/crypto/performance?days=30'),
    staleTime: 300_000,
    retry: false,
  })

  const { data: weightsData } = useQuery<any>({
    queryKey: ['crypto-weights'],
    queryFn: () => api('/api/crypto/weights'),
    staleTime: 300_000,
    retry: false,
  })

  const report = perfData?.report
  const weights = weightsData?.weights

  if (perfLoading) {
    return (
      <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
        Loading performance data...
      </div>
    )
  }

  if (!report) {
    return (
      <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
        No performance data yet. Signals need to hit TP/SL first.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BarChart3 size={20} style={{ color: 'var(--kt-gold)' }} />
        <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>
          Signal Performance
        </h1>
        <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', background: 'rgba(245,158,11,.12)', color: 'var(--kt-gold)' }}>
          {report.period?.days || 30}d
        </span>
      </div>

      {/* Overall Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <StatCard label="Total Signals" value={report.overall?.total || 0} icon={<Target size={14} style={{ color: 'var(--kt-gold)' }} />} />
        <StatCard label="Win Rate" value={`${report.overall?.win_rate || 0}%`} color={report.overall?.win_rate >= 50 ? 'var(--kt-up)' : 'var(--kt-dn)'} icon={<TrendingUp size={14} style={{ color: report.overall?.win_rate >= 50 ? 'var(--kt-up)' : 'var(--kt-dn)' }} />} />
        <StatCard label="Avg PnL" value={`${report.overall?.avg_pnl || 0}%`} color={report.overall?.avg_pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)'} />
        <StatCard label="Total PnL" value={`${report.overall?.total_pnl || 0}%`} color={report.overall?.total_pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)'} />
        <StatCard label="Avg R:R" value={`${report.overall?.avg_rr_planned || 0}`} />
        <StatCard label="Avg Hold" value={`${report.holding_time?.avg_hours || 0}h`} icon={<Clock size={14} style={{ color: 'var(--kt-dim)' }} />} />
      </div>

      {/* By Symbol */}
      {report.by_symbol?.length > 0 && (
        <div className="kt-card" style={{ overflow: 'hidden' }}>
          <div className="kt-card-pad" style={{ borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, fontSize: 'var(--sm)', color: 'var(--kt-text)' }}>
            Performance by Symbol
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Signals</th>
                  <th>Win Rate</th>
                  <th>Avg PnL</th>
                  <th>Total PnL</th>
                </tr>
              </thead>
              <tbody>
                {report.by_symbol.map((s: any) => (
                  <tr key={s.symbol}>
                    <td style={{ fontWeight: 600, color: 'var(--kt-gold)' }}>{s.symbol}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.total}</td>
                    <td><WinRateBar wins={s.wins} total={s.total} /></td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: s.avg_pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                      {s.avg_pnl >= 0 ? '+' : ''}{s.avg_pnl}%
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.total_pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                      {s.total_pnl >= 0 ? '+' : ''}{s.total_pnl}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Confidence */}
      {report.by_confidence?.length > 0 && (
        <div className="kt-card" style={{ overflow: 'hidden' }}>
          <div className="kt-card-pad" style={{ borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, fontSize: 'var(--sm)', color: 'var(--kt-text)' }}>
            Win Rate by Confidence
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Confidence</th>
                  <th>Signals</th>
                  <th>Win Rate</th>
                  <th>Avg PnL</th>
                </tr>
              </thead>
              <tbody>
                {report.by_confidence.map((c: any) => (
                  <tr key={c.bucket}>
                    <td style={{ fontWeight: 600 }}>{c.bucket}%</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{c.total}</td>
                    <td><WinRateBar wins={c.wins} total={c.total} /></td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: c.avg_pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                      {c.avg_pnl >= 0 ? '+' : ''}{c.avg_pnl}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adaptive Weights */}
      {weights && (
        <div className="kt-card" style={{ overflow: 'hidden' }}>
          <div className="kt-card-pad" style={{ borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, fontSize: 'var(--sm)', color: 'var(--kt-text)' }}>
            Adaptive Weights (Sample: {weights.sample_size})
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)', marginBottom: 4 }}>Layer Weights</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)' }}>
                <div>SMC: <span style={{ color: 'var(--kt-gold)' }}>{weights.smc_weight}</span></div>
                <div>Tech: <span style={{ color: 'var(--kt-gold)' }}>{weights.tech_weight}</span></div>
                <div>Vol: <span style={{ color: 'var(--kt-gold)' }}>{weights.vol_weight}</span></div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)', marginBottom: 4 }}>Min Confidence</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--sm)', fontWeight: 700, color: 'var(--kt-gold)' }}>
                {weights.min_confidence}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)', marginBottom: 4 }}>Symbol Adjustments</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)' }}>
                {Object.entries(weights.symbol_adjustments || {}).map(([sym, adj]) => (
                  <div key={sym}>
                    {sym}: <span style={{ color: (adj as number) >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                      {(adj as number) >= 0 ? '+' : ''}{String(adj)}%
                    </span>
                  </div>
                ))}
                {Object.keys(weights.symbol_adjustments || {}).length === 0 && (
                  <span style={{ color: 'var(--kt-dim)' }}>Not enough data</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily PnL */}
      {report.daily_pnl?.length > 0 && (
        <div className="kt-card" style={{ overflow: 'hidden' }}>
          <div className="kt-card-pad" style={{ borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 700, fontSize: 'var(--sm)', color: 'var(--kt-text)' }}>
            Daily PnL
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Signals</th>
                  <th>Daily PnL</th>
                  <th>Avg PnL</th>
                </tr>
              </thead>
              <tbody>
                {report.daily_pnl.map((d: any) => (
                  <tr key={d.date}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)' }}>{d.date}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{d.signals}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: d.daily_pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                      {d.daily_pnl >= 0 ? '+' : ''}{d.daily_pnl}%
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: d.avg_pnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                      {d.avg_pnl >= 0 ? '+' : ''}{d.avg_pnl}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
