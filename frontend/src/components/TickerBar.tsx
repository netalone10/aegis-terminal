import { useLivePrices } from '../lib/useLivePrices'

export default function TickerBar() {
  const { prices } = useLivePrices()

  const tickerItems = Object.values(prices).map((t) => {
    const isJpy = t.symbol.includes('JPY') || t.symbol.includes('IDR')
    const isXau = t.symbol.includes('XAU')
    const decimals = isXau ? 2 : isJpy ? 2 : 4
    const spreadPips = t.ask - t.bid
    return {
      symbol: t.symbol,
      price: t.bid.toFixed(decimals),
      change: spreadPips > 0 ? `${spreadPips.toFixed(decimals)}` : '—',
      up: t.bid >= t.ask - t.spread,
    }
  })

  if (tickerItems.length === 0) return null

  const doubled = [...tickerItems, ...tickerItems]

  return (
    <div className="h-10 bg-bg-raised/80 backdrop-blur-sm border-b border-border/50 flex items-center overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse-dot" />
        <span className="text-[10px] text-text-dim font-mono uppercase tracking-widest">Live</span>
      </div>
      <div className="w-px h-4 bg-border/50 shrink-0" />
      <div className="flex-1 overflow-hidden">
        <div className="animate-ticker flex items-center gap-10 whitespace-nowrap px-6">
          {doubled.map((t, i) => (
            <span key={i} className="flex items-center gap-2.5 text-xs font-mono">
              <span className="text-text-muted font-semibold">{t.symbol}</span>
              <span className="text-text font-medium">{t.price}</span>
              <span className={t.up ? 'text-emerald' : 'text-red'}>{t.change}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
