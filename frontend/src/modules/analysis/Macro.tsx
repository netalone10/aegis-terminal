import { TrendingUp, TrendingDown, Minus, Globe, Calendar, Landmark } from 'lucide-react'

const REGIME = { name: 'Goldilocks', description: 'Moderate growth with controlled inflation — favorable for risk assets', confidence: 78 }

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
  const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1
  const w = 60; const h = 20
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0 opacity-80">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <TrendingUp size={14} className="text-primary" />
  if (trend === 'down') return <TrendingDown size={14} className="text-danger" />
  return <Minus size={14} className="text-fg-muted" />
}

const IMPACT_COLORS: Record<string, string> = {
  High: 'chip-danger', Medium: 'chip-warning', Low: 'chip-muted',
}

export default function Macro() {
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Macro Overview</h1>
          <p className="text-[13px] text-fg-muted mt-1">Economic regime & indicators</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-muted font-mono">
          <Globe size={14} className="text-info" />
          <span>Last updated: 2h ago</span>
        </div>
      </div>

      {/* Regime card */}
      <div className="glass p-6 glow-primary">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] text-fg-muted uppercase tracking-widest font-mono">Current Regime</span>
            <h2 className="text-2xl font-bold text-primary mt-1">{REGIME.name}</h2>
            <p className="text-[13px] text-fg-secondary mt-1 max-w-lg">{REGIME.description}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-fg-muted font-mono">Confidence</span>
            <div className="flex items-center gap-3 mt-2">
              <div className="w-32 h-2 bg-surface/80 rounded-full overflow-hidden">
                <div className="h-full score-bar-primary rounded-full" style={{ width: `${REGIME.confidence}%` }} />
              </div>
              <span className="text-lg font-mono font-bold text-primary">{REGIME.confidence}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Macro indicators grid */}
      <div className="grid grid-cols-5 gap-4">
        {INDICATORS.map(ind => (
          <div key={ind.label} className="glass glass-hover gradient-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-fg-muted font-mono">{ind.label}</span>
              <TrendIcon trend={ind.trend} />
            </div>
            <span className="text-xl font-bold font-mono text-fg">{ind.value}</span>
            <div className="mt-3">
              <MiniSparkline data={ind.data} color={ind.trend === 'up' ? '#3ecf8e' : ind.trend === 'down' ? '#e54d2e' : '#898989'} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Economic calendar */}
        <div className="glass overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30">
            <Calendar size={14} className="text-warning" />
            <span className="text-[13px] font-medium">Economic Calendar</span>
          </div>
          <div className="divide-y divide-border/15">
            {CALENDAR.map((ev, i) => (
              <div key={i} className="flex items-center px-5 py-2.5 table-row-hover">
                <span className="text-[11px] font-mono text-fg-muted w-14 shrink-0">{ev.date}</span>
                <span className="text-[12px] text-fg flex-1">{ev.event}</span>
                <span className={`chip ${IMPACT_COLORS[ev.impact]}`}>{ev.impact}</span>
                <div className="ml-4 text-right">
                  <span className="text-[11px] font-mono text-fg-secondary">Fcst: {ev.forecast}</span>
                  <span className="text-[10px] text-fg-placeholder ml-2">Prev: {ev.previous}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rates comparison */}
        <div className="glass overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30">
            <Landmark size={14} className="text-info" />
            <span className="text-[13px] font-medium">Central Bank Rates</span>
          </div>
          <div className="divide-y divide-border/15">
            {RATES.map(r => (
              <div key={r.central} className="flex items-center px-5 py-3 table-row-hover">
                <span className="text-[13px] text-fg-secondary w-24 shrink-0">{r.central}</span>
                <span className="text-[13px] font-mono font-bold text-fg w-16">{r.rate}</span>
                <span className={`flex items-center gap-1 text-[11px] font-mono w-12 ${
                  r.change === 'up' ? 'text-primary' : r.change === 'down' ? 'text-danger' : 'text-fg-muted'
                }`}>
                  <TrendIcon trend={r.change as any} />
                </span>
                <span className="text-[11px] text-fg-muted flex-1 font-mono">Next: {r.next}</span>
                <span className={`chip ${
                  r.bias === 'Hike' ? 'chip-primary' : r.bias === 'Cut' ? 'chip-danger' : 'chip-muted'
                }`}>{r.bias}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
