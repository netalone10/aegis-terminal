import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, ExternalLink, Newspaper, Zap, Activity, ArrowUpRight, DollarSign, Flame } from 'lucide-react'
import { api } from '../../lib/api'

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

// XAU/USD Hero Card — biggest, most prominent
function XauHeroCard() {
  const { data: forexData, isLoading } = useQuery({
    queryKey: ['forex-live'],
    queryFn: () => api<any>('/api/forex/live'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })

  const xau = (forexData?.pairs ?? []).find((p: any) => p.symbol === 'XAU/USD')

  if (isLoading) return (
    <div className="glass p-6 col-span-2">
      <Skeleton className="w-20 h-3 mb-3" />
      <Skeleton className="w-48 h-10 mb-3" />
      <Skeleton className="w-full h-16" />
    </div>
  )

  if (!xau) return null

  const price = xau.price ?? 0
  const rsi = xau.rsi ?? 50
  const macdLine = xau.macdLine ?? 0
  const macdSignal = xau.macdSignal ?? 0
  const trend = xau.recommendation > 0 ? 'bullish' : xau.recommendation < -0.3 ? 'bearish' : 'neutral'
  const isUp = trend === 'bullish'
  const ema20 = xau.ema20 ?? 0
  const ema50 = xau.ema50 ?? 0
  const sma200 = xau.sma200 ?? 0

  return (
    <div className="glass glass-hover gradient-border p-6 col-span-2 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary/5 rounded-full blur-3xl" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center">
              <Flame size={18} className="text-warning" />
            </div>
            <div>
              <span className="text-[10px] text-fg-muted font-mono uppercase tracking-widest">XAU/USD</span>
              <div className="text-[11px] text-fg-muted">Gold Spot</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`chip ${isUp ? 'chip-primary' : trend === 'bearish' ? 'chip-danger' : 'chip-warning'}`}>
              {trend.toUpperCase()}
            </span>
            <span className={`chip ${xau.changePct > 0 ? 'chip-primary' : 'chip-danger'}`}>
              {xau.changePct > 0 ? '+' : ''}{(xau.changePct ?? 0).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="flex items-end gap-4 mb-5">
          <span className="text-4xl font-bold font-mono tracking-tight">${price.toFixed(2)}</span>
          <span className={`text-lg font-mono font-semibold mb-1 ${isUp ? 'text-primary' : 'text-danger'}`}>
            {isUp ? '▲' : '▼'}
          </span>
        </div>

        {/* TA Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-surface/40 rounded-lg p-3 border border-border/20">
            <span className="text-[10px] text-fg-muted font-mono">RSI (14)</span>
            <div className={`text-lg font-mono font-bold mt-1 ${rsi > 70 ? 'text-danger' : rsi < 30 ? 'text-primary' : 'text-fg'}`}>
              {rsi.toFixed(1)}
            </div>
            <span className="text-[9px] text-fg-placeholder font-mono">{rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL'}</span>
          </div>
          <div className="bg-surface/40 rounded-lg p-3 border border-border/20">
            <span className="text-[10px] text-fg-muted font-mono">MACD</span>
            <div className={`text-lg font-mono font-bold mt-1 ${macdLine > macdSignal ? 'text-primary' : 'text-danger'}`}>
              {(macdLine - macdSignal).toFixed(2)}
            </div>
            <span className="text-[9px] text-fg-placeholder font-mono">{macdLine > macdSignal ? 'BULLISH' : 'BEARISH'}</span>
          </div>
          <div className="bg-surface/40 rounded-lg p-3 border border-border/20">
            <span className="text-[10px] text-fg-muted font-mono">EMA 20/50</span>
            <div className="text-sm font-mono font-bold mt-1 text-fg">
              {ema20.toFixed(0)} / {ema50.toFixed(0)}
            </div>
            <span className={`text-[9px] font-mono ${ema20 > ema50 ? 'text-primary' : 'text-danger'}`}>
              {ema20 > ema50 ? 'GOLDEN CROSS' : 'DEATH CROSS'}
            </span>
          </div>
          <div className="bg-surface/40 rounded-lg p-3 border border-border/20">
            <span className="text-[10px] text-fg-muted font-mono">SMA 200</span>
            <div className="text-sm font-mono font-bold mt-1 text-fg">
              {sma200.toFixed(0)}
            </div>
            <span className={`text-[9px] font-mono ${price > sma200 ? 'text-primary' : 'text-danger'}`}>
              {price > sma200 ? 'ABOVE' : 'BELOW'} LONG-TERM
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Forex pairs grid — shared forex data
function ForexPairCard({ symbol, name }: { symbol: string; name: string }) {
  const { data: forexData, isLoading } = useQuery({
    queryKey: ['forex-live'],
    queryFn: () => api<any>('/api/forex/live'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })

  const pair = (forexData?.pairs ?? []).find((p: any) => p.symbol === symbol)

  if (isLoading) return (
    <div className="glass p-4">
      <Skeleton className="w-16 h-3 mb-2" />
      <Skeleton className="w-24 h-6 mb-2" />
      <Skeleton className="w-20 h-3" />
    </div>
  )

  if (!pair) return null

  const price = pair.price ?? 0
  const rsi = pair.rsi ?? 50
  const change = pair.changePct ?? 0
  const isUp = change >= 0

  return (
    <div className="glass glass-hover gradient-border p-4 group cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-fg-muted font-mono uppercase tracking-widest">{symbol}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isUp ? 'bg-primary/10' : 'bg-danger/10'}`}>
          {isUp ? <TrendingUp size={13} className="text-primary" /> : <TrendingDown size={13} className="text-danger" />}
        </div>
      </div>
      <div className="text-xl font-bold font-mono tracking-tight">
        ${symbol.includes('JPY') || symbol.includes('IDR') ? price.toFixed(2) : price.toFixed(4)}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-fg-muted">{name}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono font-semibold ${isUp ? 'text-primary' : 'text-danger'}`}>
            {isUp ? '+' : ''}{change.toFixed(2)}%
          </span>
          <span className={`text-[10px] font-mono ${rsi > 60 ? 'text-primary' : rsi < 40 ? 'text-danger' : 'text-fg-muted'}`}>
            RSI {rsi.toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { data: newsData, isLoading: newsLoading } = useQuery({
    queryKey: ['home-news'],
    queryFn: () => api<any[]>('/api/news/latest'),
    staleTime: 60_000,
    retry: false,
  })

  const { data: regimeData } = useQuery({
    queryKey: ['home-regime'],
    queryFn: () => api<any>('/api/macro/regime'),
    staleTime: 120_000,
    refetchInterval: 120_000,
    retry: false,
  })

  const newsItems = (newsData ?? []).slice(0, 6).map((n: any) => ({
    title: n.title ?? 'Untitled',
    source: n.source ?? 'Unknown',
    time: n.pubDate ? new Date(n.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
    link: n.link,
  }))

  const forexPairs = [
    { symbol: 'EUR/USD', name: 'Euro / Dollar' },
    { symbol: 'GBP/USD', name: 'Pound / Dollar' },
    { symbol: 'USD/JPY', name: 'Dollar / Yen' },
    { symbol: 'USD/IDR', name: 'Dollar / Rupiah' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Trading Dashboard</h1>
          <p className="text-[13px] text-fg-muted mt-1">XAU/USD & Forex — Real-time analysis</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-muted font-mono">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span>Markets Open</span>
        </div>
      </div>

      {/* XAU Hero + Regime */}
      <div className="grid grid-cols-3 gap-4">
        <XauHeroCard />
        
        {/* Regime Card */}
        <div className="glass glass-hover gradient-border p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-fg-muted font-mono uppercase tracking-widest">Macro Regime</span>
            <h3 className="text-lg font-bold text-primary mt-2">{regimeData?.regime?.replace('_', ' ').toUpperCase() ?? 'LOADING'}</h3>
            <p className="text-[11px] text-fg-secondary mt-1">Risk: {regimeData?.riskLevel?.toUpperCase() ?? '—'}</p>
          </div>
          <div className="space-y-2 mt-4">
            <div className="flex justify-between text-[11px]">
              <span className="text-fg-muted font-mono">VIX</span>
              <span className="font-mono font-semibold">{regimeData?.signals?.vix?.current?.toFixed(1) ?? '—'}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-fg-muted font-mono">S&P 500</span>
              <span className="font-mono font-semibold">{regimeData?.signals?.sp500?.current?.toLocaleString() ?? '—'}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-fg-muted font-mono">30D Return</span>
              <span className={`font-mono font-semibold ${(regimeData?.signals?.sp500?.return30d ?? 0) >= 0 ? 'text-primary' : 'text-danger'}`}>
                {regimeData?.signals?.sp500?.return30d != null ? `${regimeData.signals.sp500.return30d > 0 ? '+' : ''}${regimeData.signals.sp500.return30d}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Forex Pairs Grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={14} className="text-primary" />
          <span className="text-[13px] font-semibold">Forex Pairs</span>
          <span className="text-[10px] text-fg-muted font-mono ml-auto">Daily timeframe</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {forexPairs.map(pair => <ForexPairCard key={pair.symbol} {...pair} />)}
        </div>
      </div>

      {/* News + Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 glass overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30">
            <Newspaper size={14} className="text-info" />
            <span className="text-[13px] font-medium">Headlines</span>
          </div>
          <div className="divide-y divide-border/20">
            {newsLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 mx-4 my-2" />)
            ) : newsItems.length > 0 ? (
              newsItems.map((item: any, i: number) => (
                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="block px-5 py-3 hover:bg-primary/[0.03] transition-colors group">
                  <p className="text-[12px] text-fg leading-relaxed group-hover:text-primary transition-colors line-clamp-2">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-fg-muted font-mono">{item.source}</span>
                    <span className="text-[10px] text-fg-placeholder">•</span>
                    <span className="text-[10px] text-fg-placeholder font-mono">{item.time}</span>
                    <ExternalLink size={10} className="ml-auto text-fg-placeholder opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </a>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-[11px] text-fg-placeholder font-mono">No news available</div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <a href="/chart" className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-primary to-primary-hover text-canvas text-[13px] font-semibold rounded-xl hover:shadow-[0_0_24px_rgba(62,207,142,0.3)] transition-all group">
            <Activity size={16} />
            <span>Open Chart</span>
            <ArrowUpRight size={14} className="ml-auto opacity-60 group-hover:opacity-100 transition-opacity" />
          </a>
          <a href="/decision" className="flex items-center gap-3 px-5 py-4 glass text-[13px] text-fg-secondary rounded-xl hover:text-fg hover:border-primary/30 transition-all group">
            <Zap size={16} />
            <span>Decision Engine</span>
            <ArrowUpRight size={14} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
          <a href="/journal" className="flex items-center gap-3 px-5 py-4 glass text-[13px] text-fg-secondary rounded-xl hover:text-fg hover:border-primary/30 transition-all group">
            <DollarSign size={16} />
            <span>Trading Journal</span>
            <ArrowUpRight size={14} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
          <a href="/rates" className="flex items-center gap-3 px-5 py-4 glass text-[13px] text-fg-secondary rounded-xl hover:text-fg hover:border-primary/30 transition-all group">
            <TrendingUp size={16} />
            <span>Rates & Bonds</span>
            <ArrowUpRight size={14} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
        </div>
      </div>
    </div>
  )
}
