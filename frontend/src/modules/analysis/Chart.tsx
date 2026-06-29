import { useState } from 'react'
import { Search, CandlestickChart, BarChart2, Waves, Activity, Volume2 } from 'lucide-react'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', 'D', 'W', 'M']

const INDICATORS = [
  { key: 'rsi', label: 'RSI', icon: Activity },
  { key: 'macd', label: 'MACD', icon: BarChart2 },
  { key: 'bb', label: 'Bollinger', icon: Waves },
  { key: 'volume', label: 'Volume', icon: Volume2 },
]

export default function Chart() {
  const [symbol, setSymbol] = useState('XAU/USD')
  const [timeframe, setTimeframe] = useState('D')
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['rsi']))

  const toggleIndicator = (key: string) => {
    const next = new Set(activeIndicators)
    next.has(key) ? next.delete(key) : next.add(key)
    setActiveIndicators(next)
  }

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Lab Chart</div>
          <h1>Chart</h1>
          <p>Charting workspace untuk validasi struktur, level, dan execution zone</p>
        </div>
      </div>

      {/* Symbol + Timeframe Bar */}
      <div className="kt-card" style={{ marginBottom: 16 }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', flex: '0 0 200px' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--kt-dim)' }} />
            <input
              className="kt-input"
              style={{ width: '100%', paddingLeft: 32 }}
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              placeholder="Symbol..."
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                className={`kt-tag ${timeframe === tf ? 'gold' : ''}`}
                onClick={() => setTimeframe(tf)}
                style={{ cursor: 'pointer', minWidth: 36, justifyContent: 'center' }}
              >
                {tf}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {INDICATORS.map(ind => (
              <button
                key={ind.key}
                className={`kt-tag ${activeIndicators.has(ind.key) ? 'gold' : ''}`}
                onClick={() => toggleIndicator(ind.key)}
                style={{ cursor: 'pointer' }}
              >
                {ind.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Placeholder */}
      <div className="kt-panel" style={{ minHeight: 500 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CandlestickChart size={16} style={{ color: 'var(--kt-gold)' }} />
            <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{symbol}</span>
            <span className="kt-tag gold">{timeframe}</span>
          </div>
          <span style={{ color: 'var(--kt-dim)', fontSize: 'var(--xs)', letterSpacing: 1.6, textTransform: 'uppercase' }}>
            Chart integration pending — TradingView widget coming soon
          </span>
        </div>
        <div className="kt-panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="kt-gridline" style={{ width: '100%', height: 400, borderRadius: 14 }} />
        </div>
      </div>
    </div>
  )
}
