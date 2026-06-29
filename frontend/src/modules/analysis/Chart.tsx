import { useState } from 'react'
import { Search, CandlestickChart, BarChart2, Waves, Activity, Volume2 } from 'lucide-react'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', 'D', 'W', 'M']

const INDICATORS = [
  { key: 'rsi', label: 'RSI', icon: Activity },
  { key: 'macd', label: 'MACD', icon: BarChart2 },
  { key: 'bb', label: 'BB', icon: Waves },
  { key: 'volume', label: 'Volume', icon: Volume2 },
]

export default function Chart() {
  const [symbol, setSymbol] = useState('BBCA.JK')
  const [timeframe, setTimeframe] = useState('D')
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['rsi']))

  const toggleIndicator = (key: string) => {
    const next = new Set(activeIndicators)
    next.has(key) ? next.delete(key) : next.add(key)
    setActiveIndicators(next)
  }

  return (
    <div className="flex h-full">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Symbol search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-default">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder" />
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="Search symbol..."
              className="w-full pl-9 pr-3 py-1.5 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary transition-colors font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <CandlestickChart size={14} className="text-primary" />
            <span className="text-sm font-mono font-medium text-fg">{symbol}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
            <span>Chart Ready</span>
          </div>
        </div>

        {/* Chart placeholder */}
        <div className="flex-1 flex items-center justify-center m-4 border-2 border-dashed border-border rounded-lg bg-surface-dark">
          <div className="text-center space-y-3">
            <CandlestickChart size={48} className="mx-auto text-fg-placeholder" />
            <div>
              <p className="text-sm font-medium text-fg-muted">TradingView Chart Widget</p>
              <p className="text-xs text-fg-placeholder mt-1">
                {symbol} · {timeframe} timeframe
                {activeIndicators.size > 0 && ` · ${[...activeIndicators].map(k => k.toUpperCase()).join(', ')}`}
              </p>
            </div>
            <p className="text-[10px] text-fg-placeholder font-mono">Widget will be embedded here</p>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-t border-border bg-default">
          <span className="text-[10px] text-fg-placeholder uppercase tracking-wider mr-2">TF</span>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded text-xs font-mono font-medium transition-all ${
                timeframe === tf
                  ? 'bg-primary text-canvas'
                  : 'bg-surface border border-border text-fg-muted hover:border-border-hover hover:text-fg-secondary'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Side panel — Quick indicators */}
      <aside className="w-48 shrink-0 border-l border-border bg-default p-4 space-y-4">
        <div>
          <span className="text-[10px] text-fg-placeholder uppercase tracking-wider">Indicators</span>
        </div>
        <div className="space-y-2">
          {INDICATORS.map(ind => {
            const Icon = ind.icon
            const active = activeIndicators.has(ind.key)
            return (
              <button
                key={ind.key}
                onClick={() => toggleIndicator(ind.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium border transition-all ${
                  active
                    ? 'bg-primary-bg border-primary text-primary'
                    : 'bg-surface border-border text-fg-muted hover:border-border-hover hover:text-fg-secondary'
                }`}
              >
                <Icon size={14} />
                <span>{ind.label}</span>
                <span className={`ml-auto w-2 h-2 rounded-full ${active ? 'bg-primary' : 'bg-fg-placeholder'}`} />
              </button>
            )
          })}
        </div>

        <div className="pt-3 border-t border-border">
          <span className="text-[10px] text-fg-placeholder uppercase tracking-wider">Chart Type</span>
          <div className="mt-2 space-y-1.5">
            {['Candlestick', 'Line', 'Area'].map(type => (
              <button
                key={type}
                className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                  type === 'Candlestick'
                    ? 'bg-surface text-fg border border-border-hover'
                    : 'text-fg-muted hover:text-fg-secondary hover:bg-surface-hover'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
