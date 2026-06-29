import { TrendingUp, TrendingDown, Minus, Globe, Calendar, Landmark } from 'lucide-react'

const REGIME = { name: 'Goldilocks', description: 'Moderate growth with controlled inflation — favorable for risk assets', confidence: 78 }

const INDICATORS = [
  { label: 'CPI (YoY)', value: '3.2%', trend: 'down' as const },
  { label: 'GDP Growth', value: '2.8%', trend: 'up' as const },
  { label: 'Unemployment', value: '3.7%', trend: 'down' as const },
  { label: 'Fed Rate', value: '5.25%', trend: 'flat' as const },
  { label: 'Yield Spread', value: '0.45%', trend: 'up' as const },
]

const CALENDAR = [
  { date: 'Jul 2', event: 'US ISM Manufacturing', impact: 'High', forecast: '49.2', previous: '48.7' },
  { date: 'Jul 5', event: 'US Non-Farm Payrolls', impact: 'High', forecast: '185K', previous: '272K' },
  { date: 'Jul 10', event: 'US CPI (YoY)', impact: 'High', forecast: '3.1%', previous: '3.2%' },
  { date: 'Jul 11', event: 'BI Rate Decision', impact: 'Medium', forecast: '6.25%', previous: '6.25%' },
  { date: 'Jul 15', event: 'China GDP (Q2)', impact: 'High', forecast: '5.0%', previous: '5.3%' },
  { date: 'Jul 17', event: 'ECB Rate Decision', impact: 'Medium', forecast: '4.25%', previous: '4.25%' },
  { date: 'Jul 24', event: 'Japan BOJ Rate', impact: 'Medium', forecast: '0.1%', previous: '0.0%' },
  { date: 'Jul 31', event: 'US FOMC Decision', impact: 'High', forecast: '5.25%', previous: '5.25%' },
]

const RATES = [
  { central: 'Fed (US)', rate: '5.25%', next: 'Jul 31', bias: 'Hold', change: 'flat' },
  { central: 'ECB (EU)', rate: '4.25%', next: 'Jul 17', bias: 'Hold', change: 'flat' },
  { central: 'BOJ (JP)', rate: '0.0%', next: 'Jul 24', bias: 'Hike', change: 'up' },
  { central: 'BI (ID)', rate: '6.25%', next: 'Jul 11', bias: 'Hold', change: 'flat' },
  { central: 'BOE (UK)', rate: '5.25%', next: 'Aug 1', bias: 'Cut', change: 'down' },
]

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (trend === 'down') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function ImpactBadge({ impact }: { impact: string }) {
  if (impact === 'High') return <span className="badge-bear">{impact}</span>
  return <span className="badge-neutral">{impact}</span>
}

export default function Macro() {
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

      {/* Regime Card */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Current Regime</span>
          </div>
          <span className="badge-info">{REGIME.confidence}% confidence</span>
        </div>
        <div className="kt-panel-body">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
            <span className="kt-stat-value gold" style={{ fontSize: 'var(--xl)' }}>{REGIME.name}</span>
          </div>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--md)' }}>{REGIME.description}</p>
        </div>
      </div>

      {/* Indicators */}
      <div className="kt-stat-grid kt-stat-grid-5" style={{ marginBottom: 16 }}>
        {INDICATORS.map(ind => (
          <div key={ind.label} className="kt-stat">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <TrendIcon trend={ind.trend} />
              <span className="kt-stat-label" style={{ margin: 0 }}>{ind.label}</span>
            </div>
            <div className="kt-stat-value">{ind.value}</div>
          </div>
        ))}
      </div>

      {/* Central Bank Rates */}
      <div className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Central Bank Rates</h2>
            <p>Current policy rates and next decision dates</p>
          </div>
          <Landmark size={16} style={{ color: 'var(--kt-muted)' }} />
        </div>
        <div className="kt-card">
          <table className="kt-table">
            <thead>
              <tr>
                <th>Central Bank</th>
                <th>Rate</th>
                <th>Next Decision</th>
                <th>Bias</th>
              </tr>
            </thead>
            <tbody>
              {RATES.map(r => (
                <tr key={r.central}>
                  <td className="mono" style={{ color: 'var(--kt-text)' }}>{r.central}</td>
                  <td className="mono">{r.rate}</td>
                  <td>{r.next}</td>
                  <td>
                    <span className={
                      r.change === 'up' ? 'badge-bull'
                      : r.change === 'down' ? 'badge-bear'
                      : 'badge-neutral'
                    }>{r.bias}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Economic Calendar */}
      <div className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Economic Calendar</h2>
            <p>High-impact events for the current month</p>
          </div>
          <Calendar size={16} style={{ color: 'var(--kt-muted)' }} />
        </div>
        <div className="kt-card">
          <table className="kt-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Impact</th>
                <th>Forecast</th>
                <th>Previous</th>
              </tr>
            </thead>
            <tbody>
              {CALENDAR.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{e.date}</td>
                  <td style={{ color: 'var(--kt-text)' }}>{e.event}</td>
                  <td><ImpactBadge impact={e.impact} /></td>
                  <td className="mono">{e.forecast}</td>
                  <td className="mono" style={{ color: 'var(--kt-muted)' }}>{e.previous}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
