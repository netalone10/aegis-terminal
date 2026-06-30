import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { TrendingUp, TrendingDown, Minus, Globe, Calendar, Landmark } from 'lucide-react'

interface MacroIndicator {
  seriesId: string
  latest: number | string
  previous: number | string
  change: number
}

interface MacroRates {
  rates: Record<string, number | null>
  spreads: Record<string, string | null>
  curveShape: string
}

interface MacroRegime {
  regime: string
  riskLevel: string
  signals: Record<string, any>
}

function TrendIcon({ change }: { change: number }) {
  if (change > 0) return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (change < 0) return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

const REGIME_LABELS: Record<string, { name: string; description: string }> = {
  goldilocks: { name: 'Goldilocks', description: 'Moderate growth with controlled inflation — favorable for risk assets' },
  bull: { name: 'Bull Market', description: 'Strong growth momentum with rising confidence across risk assets' },
  bear: { name: 'Bear Market', description: 'Contracting growth with elevated risk-off sentiment' },
  neutral: { name: 'Neutral', description: 'Mixed signals with balanced risk and growth indicators' },
  risk_on: { name: 'Risk-On', description: 'Favorable conditions for risk assets with low volatility' },
  risk_off: { name: 'Risk-Off', description: 'Elevated uncertainty driving flight to safety' },
  inflationary: { name: 'Inflationary', description: 'Rising price pressures challenging monetary policy frameworks' },
  recession: { name: 'Recession', description: 'Economic contraction with deteriorating labor and output data' },
}

const RISK_COLORS: Record<string, string> = {
  low: 'badge-bull',
  moderate: 'badge-info',
  high: 'badge-bear',
  elevated: 'badge-bear',
}

export default function Macro() {
  const { data: indicators, isLoading: loadingIndicators } = useQuery<Record<string, MacroIndicator>>({
    queryKey: ['macro-indicators'],
    queryFn: () => api('/api/macro/indicators'),
    staleTime: 300_000,
  })

  const { data: ratesData, isLoading: loadingRates } = useQuery<MacroRates>({
    queryKey: ['macro-rates'],
    queryFn: () => api('/api/macro/rates'),
    staleTime: 300_000,
  })

  const { data: regimeData, isLoading: loadingRegime } = useQuery<MacroRegime>({
    queryKey: ['macro-regime'],
    queryFn: () => api('/api/macro/regime'),
    staleTime: 300_000,
  })

  const isLoading = loadingIndicators || loadingRates || loadingRegime
  const indicatorList = indicators ? Object.entries(indicators).map(([key, val]) => ({ label: key, ...val })) : []
  const rates = ratesData?.rates ?? {}
  const regimeKey = regimeData?.regime?.toLowerCase() ?? 'neutral'
  const regime = REGIME_LABELS[regimeKey] ?? REGIME_LABELS.neutral
  const riskLevel = regimeData?.riskLevel ?? 'moderate'

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Macro Regime</div>
          <h1>Macro Context</h1>
          <p>Rates, inflation, growth, policy, and risk regime for top-down context</p>
        </div>
        <div className="kt-route-actions">
          <span className="kt-status-dot" />
          <span>Auto-refresh 5min</span>
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-body">
              <div className="skeleton w-40 h-8 mb-3" />
              <div className="skeleton w-64 h-4" />
            </div>
          </div>
          <div className="kt-stat-grid kt-stat-grid-5" style={{ marginBottom: 16 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="kt-stat">
                <div className="skeleton w-16 h-3 mb-3" />
                <div className="skeleton w-20 h-7" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Regime Card */}
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Current Regime</span>
              </div>
              <span className={RISK_COLORS[riskLevel] ?? 'badge-info'}>{riskLevel} risk</span>
            </div>
            <div className="kt-panel-body">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
                <span className="kt-stat-value gold" style={{ fontSize: 'var(--xl)' }}>{regime.name}</span>
              </div>
              <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--md)' }}>{regime.description}</p>
            </div>
          </div>

          {/* Indicators */}
          {indicatorList.length > 0 && (
            <div className="kt-stat-grid kt-stat-grid-5" style={{ marginBottom: 16 }}>
              {indicatorList.map(ind => (
                <div key={ind.label} className="kt-stat">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <TrendIcon change={ind.change} />
                    <span className="kt-stat-label" style={{ margin: 0 }}>{ind.label}</span>
                  </div>
                  <div className="kt-stat-value">{ind.latest}</div>
                </div>
              ))}
            </div>
          )}

          {/* Central Bank Rates */}
          {Object.keys(rates).length > 0 && (
            <div className="kt-section">
              <div className="kt-section-head">
                <div>
                  <h2>Key Rates</h2>
                  <p>Current policy and market rates</p>
                </div>
                <Landmark size={16} style={{ color: 'var(--kt-muted)' }} />
              </div>
              <div className="kt-card">
                <table className="kt-table">
                  <thead>
                    <tr>
                      <th>Rate</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(rates).map(([key, value]) => (
                      <tr key={key}>
                        <td className="mono" style={{ color: 'var(--kt-text)' }}>{key}</td>
                        <td className="mono">{value != null ? `${value}%` : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Signals */}
          {regimeData?.signals && Object.keys(regimeData.signals).length > 0 && (
            <div className="kt-section" style={{ marginTop: 16 }}>
              <div className="kt-section-head">
                <div>
                  <h2>Regime Signals</h2>
                  <p>Underlying signal data for current regime assessment</p>
                </div>
                <Calendar size={16} style={{ color: 'var(--kt-muted)' }} />
              </div>
              <div className="kt-card">
                <table className="kt-table">
                  <thead>
                    <tr>
                      <th>Signal</th>
                      <th>Value</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(regimeData.signals).map(([key, val]) => {
                      const signalVal = val as any
                      return (
                        <tr key={key}>
                          <td className="mono" style={{ color: 'var(--kt-text)' }}>{key.toUpperCase()}</td>
                          <td className="mono">{signalVal?.value ?? signalVal?.latest ?? '—'}</td>
                          <td>
                            <TrendIcon change={signalVal?.change ?? 0} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {indicatorList.length === 0 && Object.keys(rates).length === 0 && (
            <div className="kt-panel">
              <div className="kt-panel-body" style={{ textAlign: 'center', padding: '32px 16px' }}>
                <Globe size={24} style={{ color: 'var(--kt-muted)', marginBottom: 8 }} />
                <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--md)' }}>No macro data available</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
