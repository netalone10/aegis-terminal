import { TrendingUp, TrendingDown } from 'lucide-react'

interface MarketCardProps {
  symbol: string
  name: string
  price: number
  change: number
  rsi?: number
  ema20?: number
  ema50?: number
  support?: number
  resistance?: number
  onClick?: () => void
}

function Skeleton() {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="skeleton w-16 h-3 mb-3" />
      <div className="skeleton w-28 h-7 mb-3" />
      <div className="skeleton w-full h-4" />
    </div>
  )
}

export default function MarketCard({
  symbol, name, price, change, rsi, ema20, ema50, support, resistance, onClick
}: MarketCardProps) {
  const isUp = change >= 0
  const trend = ema20 && ema50 ? (ema20 > ema50 ? 'bullish' : 'bearish') : (isUp ? 'bullish' : 'bearish')

  const formatPrice = (v: number) => {
    if (symbol.includes('JPY') || symbol.includes('IDR')) return v.toFixed(2)
    if (symbol.includes('XAU')) return v.toFixed(2)
    return v.toFixed(4)
  }

  return (
    <div
      onClick={onClick}
      className="bg-card rounded-xl border border-border hover:border-border-hover transition-all duration-200 p-5 cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-[10px] text-text-dim font-mono uppercase tracking-widest">{symbol}</span>
          <p className="text-xs text-text-muted mt-0.5">{name}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          isUp ? 'bg-emerald-bg' : 'bg-red-bg'
        }`}>
          {isUp
            ? <TrendingUp size={14} className="text-emerald" />
            : <TrendingDown size={14} className="text-red" />
          }
        </div>
      </div>

      <div className="text-2xl font-bold font-mono tracking-tight text-text">
        {formatPrice(price)}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span className={`text-xs font-mono font-semibold ${isUp ? 'text-emerald' : 'text-red'}`}>
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </span>
        {rsi != null && (
          <span className={`text-[10px] font-mono ${rsi > 60 ? 'text-emerald' : rsi < 40 ? 'text-red' : 'text-text-muted'}`}>
            RSI {rsi.toFixed(0)}
          </span>
        )}
        <span className={`text-[10px] font-mono ml-auto ${trend === 'bullish' ? 'text-emerald' : 'text-red'}`}>
          {trend === 'bullish' ? '▲' : '▼'}
        </span>
      </div>

      {(support != null || resistance != null) && (
        <div className="mt-3 pt-3 border-t border-border/50 flex justify-between text-[10px] font-mono">
          {support != null && (
            <span className="text-text-dim">S <span className="text-emerald">{formatPrice(support)}</span></span>
          )}
          {resistance != null && (
            <span className="text-text-dim">R <span className="text-red">{formatPrice(resistance)}</span></span>
          )}
        </div>
      )}
    </div>
  )
}

export { Skeleton as MarketCardSkeleton }
