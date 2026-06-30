import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, AlertTriangle, ShieldCheck, BarChart3 } from 'lucide-react'
import { api } from '../../lib/api'

interface CotEntry {
  pair: string
  label: string
  reportDate: string
  netPosition: number
  longs: number
  shorts: number
  spread: number
  changeLong: number
  changeShort: number
  netChange: number
  openInterest: number
  pctLong: number
  pctShort: number
  bias: 'bullish' | 'bearish' | 'neutral'
  commercialNet: number
}

interface RetailSentiment {
  pair: string
  longPct: number
  shortPct: number
  signal: string
}

const RETAIL: RetailSentiment[] = [
  { pair: 'EUR/USD', longPct: 72, shortPct: 28, signal: 'Bearish' },
  { pair: 'GBP/USD', longPct: 65, shortPct: 35, signal: 'Bearish' },
  { pair: 'USD/JPY', longPct: 38, shortPct: 62, signal: 'Bullish' },
  { pair: 'AUD/USD', longPct: 55, shortPct: 45, signal: 'Neutral' },
  { pair: 'XAU/USD', longPct: 42, shortPct: 58, signal: 'Bullish' },
  { pair: 'NZD/USD', longPct: 61, shortPct: 39, signal: 'Bearish' },
]

function BiasBadge({ bias }: { bias: string }) {
  if (bias === 'bullish') return <span className="badge-bull">BULLISH</span>
  if (bias === 'bearish') return <span className="badge-bear">BEARISH</span>
  return <span className="badge-neutral">NEUTRAL</span>
}

function SignalBadge({ signal }: { signal: string }) {
  if (signal === 'Bullish') return <span className="badge-bull">↑ BULL</span>
  if (signal === 'Bearish') return <span className="badge-bear">↓ BEAR</span>
  return <span className="badge-neutral">— FLAT</span>
}

function ChangeArrow({ value }: { value: number }) {
  if (value > 0) return (
    <span style={{ color: 'var(--kt-up)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
      <ArrowUpRight size={12} />+{(value / 1000).toFixed(1)}K
    </span>
  )
  if (value < 0) return (
    <span style={{ color: 'var(--kt-dn)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
      <ArrowDownRight size={12} />{(value / 1000).toFixed(1)}K
    </span>
  )
  return <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>—</span>
}

function HeatColor({ value, max }: { value: number; max: number }) {
  const ratio = Math.min(Math.abs(value) / (max || 1), 1)
  if (value > 0) {
    const alpha = 0.15 + ratio * 0.45
    return { background: `rgba(0, 200, 120, ${alpha})` }
  }
  if (value < 0) {
    const alpha = 0.15 + ratio * 0.45
    return { background: `rgba(255, 60, 60, ${alpha})` }
  }
  return { background: 'transparent' }
}

export default function Sentiment() {
  const { data: cot, isLoading } = useQuery<CotEntry[]>({
    queryKey: ['sentiment', 'cot'],
    queryFn: () => api('/api/sentiment/cot'),
    refetchInterval: 3_600_000, // 1 hour
    staleTime: 3_600_000,
  })

    const maxChange = cot ? Math.max(...cot.map(c => Math.abs(c.netChange)), 1) : 1

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">POSITION DATA</div>
          <h1>Market Sentiment</h1>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)' }}>
            COT report + retail positioning — find contrarian opportunities
          </p>
        </div>
        <div className="kt-route-actions">
          <span className="kt-status-dot" />
          <span>CFTC COT — Weekly</span>
        </div>
      </div>

      {/* ── COT Positioning Cards ── */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
              COT — Institutional Positioning
            </span>
          </div>
          {cot?.[0]?.reportDate && (
            <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
              Report: {cot[0].reportDate}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="kt-panel-body" style={{ color: 'var(--kt-muted)', padding: 24, textAlign: 'center' }}>
            Loading CFTC data…
          </div>
        ) : (
          <div className="kt-panel-body">
            <div className="kt-grid-4" style={{ gap: 12 }}>
              {cot?.map(entry => {
                const barPct = entry.openInterest > 0 ? Math.abs(entry.netPosition) / entry.openInterest : 0
                const isLong = entry.netPosition > 0

                return (
                  <div key={entry.pair} className="kt-card-pad" style={{
                    borderLeft: `3px solid ${entry.bias === 'bullish' ? 'var(--kt-up)' : entry.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ color: 'var(--kt-text)', fontWeight: 700, fontSize: 'var(--md)', fontFamily: 'var(--font-mono)' }}>
                        {entry.label}
                      </span>
                      <BiasBadge bias={entry.bias} />
                    </div>

                    {/* Net position bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)' }}>
                          Net: {isLong ? '+' : ''}{(entry.netPosition / 1000).toFixed(1)}K
                        </span>
                        <ChangeArrow value={entry.netChange} />
                      </div>
                      <div style={{
                        height: 8,
                        background: 'var(--kt-bg2)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        position: 'relative',
                      }}>
                        {/* Center marker */}
                        <div style={{
                          position: 'absolute',
                          left: '50%',
                          top: 0,
                          bottom: 0,
                          width: 1,
                          background: 'var(--kt-border)',
                          zIndex: 1,
                        }} />
                        <div style={{
                          position: 'absolute',
                          height: '100%',
                          borderRadius: 4,
                          ...(isLong ? {
                            left: '50%',
                            width: `${barPct * 50}%`,
                            background: 'var(--kt-up)',
                          } : {
                            right: '50%',
                            width: `${barPct * 50}%`,
                            background: 'var(--kt-dn)',
                          }),
                        }} />
                      </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                      <span>L: {(entry.longs / 1000).toFixed(0)}K</span>
                      <span>S: {(entry.shorts / 1000).toFixed(0)}K</span>
                      <span>Chg: <ChangeArrow value={entry.netChange} /></span>
                    </div>

                    {/* Contrarian */}
                    <div style={{
                      marginTop: 8,
                      padding: '4px 8px',
                      background: 'var(--kt-bg2)',
                      borderRadius: 4,
                      fontSize: 'var(--xs)',
                      color: entry.bias === 'bullish' ? 'var(--kt-up)' : entry.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)',
                    }}>
                      {entry.bias === 'bullish' ? '⚡ Institutions net long — bullish bias' :
                       entry.bias === 'bearish' ? '⚡ Institutions net short — bearish bias' :
                       '— Positioning neutral'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Retail Sentiment ── */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
              Retail Positioning (IG-style)
            </span>
          </div>
          <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Mock data</span>
        </div>
        <div className="kt-panel-body">
          <div className="kt-grid-2" style={{ gap: 12 }}>
            {RETAIL.map(r => (
              <div key={r.pair} className="kt-card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: 'var(--kt-text)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 'var(--md)' }}>
                    {r.pair}
                  </span>
                  <SignalBadge signal={r.signal} />
                </div>

                {/* Horizontal bar */}
                <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{
                    width: `${r.longPct}%`,
                    background: 'rgba(0, 200, 120, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--xs)',
                    fontWeight: 600,
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {r.longPct}% Long
                  </div>
                  <div style={{
                    width: `${r.shortPct}%`,
                    background: 'rgba(255, 60, 60, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--xs)',
                    fontWeight: 600,
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {r.shortPct}% Short
                  </div>
                </div>

                <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                  {r.longPct > 65 ? '⚠ Retail heavily long — contrarian bearish' :
                   r.shortPct > 65 ? '⚡ Retail heavily short — contrarian bullish' :
                   '— Balanced positioning'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contrarian Signal Summary ── */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
              Contrarian Signals
            </span>
          </div>
        </div>
        <div className="kt-panel-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Retail contrarian signals */}
            {RETAIL.filter(r => r.longPct > 60 || r.shortPct > 60).map(r => {
              const isLongHeavy = r.longPct > 60
              return (
                <div key={r.pair} className="kt-card-pad" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  borderLeft: `3px solid ${isLongHeavy ? 'var(--kt-dn)' : 'var(--kt-up)'}`,
                }}>
                  {isLongHeavy
                    ? <TrendingDown size={18} style={{ color: 'var(--kt-dn)', flexShrink: 0 }} />
                    : <TrendingUp size={18} style={{ color: 'var(--kt-up)', flexShrink: 0 }} />
                  }
                  <div>
                    <div style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--sm)' }}>
                      Retail {isLongHeavy ? 'heavily long' : 'heavily short'} {r.pair}
                    </div>
                    <div style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)' }}>
                      {isLongHeavy
                        ? `→ Smart money likely short ${r.pair}`
                        : `→ Smart money likely long ${r.pair}`}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto' }}>
                    {isLongHeavy ? <span className="badge-bear">BEARISH</span> : <span className="badge-bull">BULLISH</span>}
                  </span>
                </div>
              )
            })}

            {/* COT contrarian signals */}
            {cot?.filter(e => e.bias !== 'neutral').map(entry => (
              <div key={entry.pair} className="kt-card-pad" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderLeft: `3px solid ${entry.bias === 'bullish' ? 'var(--kt-up)' : 'var(--kt-dn)'}`,
              }}>
                {entry.bias === 'bullish'
                  ? <ShieldCheck size={18} style={{ color: 'var(--kt-up)', flexShrink: 0 }} />
                  : <AlertTriangle size={18} style={{ color: 'var(--kt-dn)', flexShrink: 0 }} />
                }
                <div>
                  <div style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--sm)' }}>
                    COT: Institutions net {entry.bias === 'bullish' ? 'long' : 'short'} {entry.label}
                  </div>
                  <div style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)' }}>
                    Net position {(entry.netPosition / 1000).toFixed(1)}K contracts
                    {entry.netChange !== 0 && ` (${entry.netChange > 0 ? '+' : ''}${(entry.netChange / 1000).toFixed(1)}K WoW)`}
                  </div>
                </div>
                <span style={{ marginLeft: 'auto' }}>
                  {entry.bias === 'bullish' ? <span className="badge-bull">BULLISH</span> : <span className="badge-bear">BEARISH</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Positioning Changes Heatmap ── */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
              Positioning Changes Heatmap
            </span>
          </div>
          <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Week-over-week</span>
        </div>
        <div className="kt-panel-body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--kt-border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Pair</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Net Pos</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Net Chg</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Long Chg</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Short Chg</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>OI</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Bias</th>
              </tr>
            </thead>
            <tbody>
              {cot?.map(entry => (
                <tr key={entry.pair} style={{ borderBottom: '1px solid var(--kt-border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--kt-text)', fontWeight: 700 }}>{entry.label}</td>
                  <td style={{
                    padding: '8px 12px',
                    textAlign: 'right',
                    color: entry.netPosition > 0 ? 'var(--kt-up)' : entry.netPosition < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)',
                  }}>
                    {entry.netPosition > 0 ? '+' : ''}{(entry.netPosition / 1000).toFixed(1)}K
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      ...HeatColor({ value: entry.netChange, max: maxChange }),
                      color: entry.netChange > 0 ? 'var(--kt-up)' : entry.netChange < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)',
                    }}>
                      {entry.netChange > 0 ? '+' : ''}{(entry.netChange / 1000).toFixed(1)}K
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      ...HeatColor({ value: entry.changeLong, max: maxChange }),
                      color: entry.changeLong > 0 ? 'var(--kt-up)' : entry.changeLong < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)',
                    }}>
                      {entry.changeLong > 0 ? '+' : ''}{(entry.changeLong / 1000).toFixed(1)}K
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      ...HeatColor({ value: entry.changeShort, max: maxChange }),
                      color: entry.changeShort > 0 ? 'var(--kt-up)' : entry.changeShort < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)',
                    }}>
                      {entry.changeShort > 0 ? '+' : ''}{(entry.changeShort / 1000).toFixed(1)}K
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-muted)' }}>
                    {(entry.openInterest / 1000).toFixed(0)}K
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <BiasBadge bias={entry.bias} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
