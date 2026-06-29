import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

const STATIC_TICKER = [
  { symbol: 'XAU/USD', price: '3,275.00', change: '-0.22%', up: false },
  { symbol: 'EUR/USD', price: '1.0845', change: '-0.12%', up: false },
  { symbol: 'GBP/USD', price: '1.2720', change: '+0.08%', up: true },
  { symbol: 'USD/JPY', price: '159.80', change: '+0.22%', up: true },
  { symbol: 'USD/IDR', price: '16,234', change: '+0.05%', up: true },
  { symbol: 'BTC/USD', price: '59,748', change: '-0.14%', up: false },
]

export default function TickerBar() {
  const { data: tickerData } = useQuery({
    queryKey: ['forex-ticker'],
    queryFn: () => api<any>('/api/forex/ticker'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })

  const tickerItems = (tickerData?.data ?? []).length > 0
    ? (tickerData.data as any[]).map((t: any) => ({
        symbol: t.symbol,
        price: typeof t.price === 'number'
          ? (t.symbol.includes('JPY') || t.symbol.includes('IDR') ? t.price.toFixed(2) : t.price.toFixed(4))
          : String(t.price ?? '—'),
        change: typeof t.change === 'number'
          ? `${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%`
          : String(t.change ?? '0%'),
        up: typeof t.change === 'number' ? t.change >= 0 : true,
      }))
    : STATIC_TICKER

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
