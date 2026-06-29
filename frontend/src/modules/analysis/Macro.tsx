import { TrendingUp, TrendingDown, Minus, Globe, Calendar, Landmark } from 'lucide-react'

const REGIME = {
  name: 'Goldilocks',
  description: 'Moderate growth with controlled inflation — favorable for risk assets',
  confidence: 78,
}

const INDICATORS = [
  { label: 'CPI (YoY)', value: '3.2%', trend: 'down' as const, data: [4.1, 3.9, 3.6, 3.4, 3.2] },
  { label: 'GDP Growth', value: '2.8%', trend: 'up' as const, data: [2.1, 2.3, 2.5, 2.6, 2.8] },
  { label: 'Unemployment', value: '3.7%', trend: 'down' as const, data: [4.0, 3.9, 3.8, 3.8, 3.7] },
  { label: 'Fed Rate', value: '5.25%', trend: 'flat' as const, data: [5.25, 5.25, 5.25, 5.25, 5.25] },
  { label: 'Yield Spread', value: '0.45%', trend: 'up' as const, data: [-0.2, 0.05, 0.15, 0.30, 0.45] },
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

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 60
  const h = 20
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  )
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <TrendingUp size={14} className="text-primary" />
  if (trend === 'down') return <TrendingDown size={14} className="text-danger" />
  return <Minus size={14} className="text-fg-muted" />
}

const IMPACT_COLORS: Record<string, string> = {
  High: 'bg-danger/15 text-danger',
  Medium: 'bg-warning/15 text-warning',
  Low: 'bg-surface text-fg-muted',
}

export default function Macro() {
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">Macro Overview</h1>
          <p className="text-sm text-fg-muted mt-0.5">Economic regime & indicators</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-muted font-mono">
          <Globe size={14} className="text-info" />
          <span>Last updated: 2h ago</span>
        </div>
      </div>

      {/* Regime card */}
      <div className="bg-default border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs text-fg-muted uppercase tracking-wider">Current Regime</span>
            <h2 className="text-2xl font-bold text-primary mt-1">{REGIME.name}</h2>
            <p className="text-sm text-fg-secondary mt-1">{REGIME.description}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-fg-muted">Confidence</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-32 h-2 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${REGIME.confidence}%` }} />
              </div>
              <span className="text-sm font-mono font-medium text-primary">{REGIME.confidence}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Macro indicators grid */}
      <div className="grid grid-cols-5 gap-4">
        {INDICATORS.map(ind => (
          <div key={ind.label} className="bg-default border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-fg-muted">{ind.label}</span>
              <TrendIcon trend={ind.trend} />
            </div>
            <span className="text-xl font-semibold font-mono text-fg">{ind.value}</span>
            <div className="mt-2">
              <MiniSparkline
                data={ind.data}
                color={ind.trend === 'up' ? '#3ecf8e' : ind.trend === 'down' ? '#e54d2e' : '#898989'}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Economic calendar */}
        <div className="bg-default border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Calendar size={14} className="text-warning" />
            <span className="text-sm font-medium text-fg">Economic Calendar</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {CALENDAR.map((ev, i) => (
              <div key={i} className="flex items-center px-4 py-2.5 hover:bg-surface-hover transition-colors">
                <span className="text-xs font-mono text-fg-muted w-12 shrink-0">{ev.date}</span>
                <span className="text-xs text-fg flex-1">{ev.event}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${IMPACT_COLORS[ev.impact]}`}>
                  {ev.impact}
                </span>
                <div className="ml-3 text-right">
                  <span className="text-xs font-mono text-fg-secondary">Fcst: {ev.forecast}</span>
                  <span className="text-[10px] text-fg-placeholder ml-2">Prev: {ev.previous}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rates comparison */}
        <div className="bg-default border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Landmark size={14} className="text-info" />
            <span className="text-sm font-medium text-fg">Central Bank Rates</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {RATES.map(r => (
              <div key={r.central} className="flex items-center px-4 py-3 hover:bg-surface-hover transition-colors">
                <span className="text-sm text-fg-secondary w-24 shrink-0">{r.central}</span>
                <span className="text-sm font-mono font-semibold text-fg w-16">{r.rate}</span>
                <span className={`flex items-center gap-1 text-xs font-mono w-12 ${
                  r.change === 'up' ? 'text-primary' : r.change === 'down' ? 'text-danger' : 'text-fg-muted'
                }`}>
                  <TrendIcon trend={r.change} />
                </span>
                <span className="text-xs text-fg-muted flex-1">Next: {r.next}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                  r.bias === 'Hike' ? 'bg-primary-bg text-primary' : r.bias === 'Cut' ? 'bg-danger/15 text-danger' : 'bg-surface text-fg-muted'
                }`}>
                  {r.bias}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
