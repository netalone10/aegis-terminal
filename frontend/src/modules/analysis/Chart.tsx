import { useState } from 'react'
import { Search, CandlestickChart, BarChart2, Waves, Activity, Volume2, Maximize2 } from 'lucide-react'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', 'D', 'W', 'M']

const INDICATORS = [
  { key: 'rsi', label: 'RSI', icon: Activity },
  { key: 'macd', label: 'MACD', icon: BarChart2 },
  { key: 'bb', label: 'Bollinger', icon: Waves },
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
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-surface-dark/40 backdrop-blur-sm">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder" />
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="Search symbol..."
              className="w-full pl-9 pr-3 py-2 glass text-[13px] text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary/50 transition-colors font-mono rounded-lg"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CandlestickChart size={14} className="text-primary" />
            </div>
            <span className="text-[13px] font-mono font-bold text-fg">{symbol}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-fg-muted font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
            <span>Chart Ready</span>
          </div>
        </div>

        {/* Chart placeholder */}
        <div className="flex-1 flex items-center justify-center m-4 rounded-xl bg-surface-dark/40 border border-dashed border-border/40">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-surface/60 border border-border/40 flex items-center justify-center mx-auto">
              <CandlestickChart size={28} className="text-fg-placeholder" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-fg-muted">TradingView Chart Widget</p>
              <p className="text-[11px] text-fg-placeholder mt-1">
                {symbol} · {timeframe} timeframe
                {activeIndicators.size > 0 && ` · ${[...activeIndicators].map(k => k.toUpperCase()).join(', ')}`}
              </p>
            </div>
            <p className="text-[10px] text-fg-placeholder font-mono">Widget will be embedded here</p>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-t border-border/40 bg-surface-dark/40 backdrop-blur-sm">
          <span className="text-[10px] text-fg-placeholder uppercase tracking-widest font-mono mr-2">TF</span>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all ${
                timeframe === tf
                  ? 'bg-gradient-to-r from-primary to-primary-hover text-canvas shadow-[0_0_10px_rgba(62,207,142,0.2)]'
                  : 'bg-surface/60 border border-border/40 text-fg-muted hover:border-border-hover hover:text-fg-secondary'
              }`}
            >
              {tf}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button className="p-1.5 text-fg-muted hover:text-fg-secondary transition-colors rounded-lg hover:bg-surface-hover/50">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Side panel */}
      <aside className="w-48 shrink-0 border-l border-border/40 bg-surface-dark/40 backdrop-blur-sm p-4 space-y-5">
        <div>
          <span className="text-[10px] text-fg-placeholder uppercase tracking-widest font-mono">Indicators</span>
        </div>
        <div className="space-y-1.5">
          {INDICATORS.map(ind => {
            const Icon = ind.icon
            const active = activeIndicators.has(ind.key)
            return (
              <button
                key={ind.key}
                onClick={() => toggleIndicator(ind.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium border transition-all ${
                  active
                    ? 'bg-primary-bg border-primary/30 text-primary glow-primary'
                    : 'bg-surface/40 border-border/30 text-fg-muted hover:border-border-hover hover:text-fg-secondary'
                }`}
              >
                <Icon size={14} />
                <span>{ind.label}</span>
                <span className={`ml-auto w-2 h-2 rounded-full transition-colors ${active ? 'bg-primary shadow-[0_0_6px_rgba(62,207,142,0.5)]' : 'bg-fg-placeholder/40'}`} />
              </button>
            )
          })}
        </div>

        <div className="divider-gradient" />

        <div>
          <span className="text-[10px] text-fg-placeholder uppercase tracking-widest font-mono">Chart Type</span>
          <div className="mt-2 space-y-1">
            {['Candlestick', 'Line', 'Area'].map(type => (
              <button
                key={type}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-[12px] transition-colors ${
                  type === 'Candlestick'
                    ? 'bg-surface/80 text-fg border border-border-hover/50'
                    : 'text-fg-muted hover:text-fg-secondary hover:bg-surface-hover/50'
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
