import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import {
  Home, BarChart3, ScanLine, CandlestickChart,
  Briefcase, BookOpen, Sparkles, TrendingUp,
  Search, Settings, Bell, Command, Zap, DollarSign
} from 'lucide-react'
import Home_ from './modules/home/Home'
import Market from './modules/market/Market'
import Scanner from './modules/scanner/Scanner'
import Chart from './modules/analysis/Chart'
import Portfolio from './modules/portfolio/Portfolio'
import Journal from './modules/analysis/Journal'
import AI from './modules/analysis/AI'
import Macro from './modules/analysis/Macro'
import Decision from './modules/analysis/Decision'
import Rates from './modules/analysis/Rates'
import { api } from './lib/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false },
  },
})

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/market', label: 'Market', icon: BarChart3 },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/chart', label: 'Chart', icon: CandlestickChart },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/ai', label: 'AI', icon: Sparkles },
  { to: '/macro', label: 'Macro', icon: TrendingUp },
  { to: '/decision', label: 'SMC', icon: Zap },
  { to: '/rates', label: 'Rates', icon: DollarSign },
]

const STATIC_TICKER = [
  { symbol: 'XAU/USD', price: '$3,275', change: '-0.22%', up: false },
  { symbol: 'EUR/USD', price: '1.0845', change: '-0.12%', up: false },
  { symbol: 'GBP/USD', price: '1.2720', change: '+0.08%', up: true },
  { symbol: 'USD/JPY', price: '159.80', change: '+0.22%', up: true },
  { symbol: 'USD/IDR', price: '16,234', change: '+0.05%', up: true },
  { symbol: 'BTC', price: '$59,748', change: '-0.14%', up: false },
  { symbol: 'S&P500', price: '5,460', change: '+0.18%', up: true },
]

function TickerBar() {
  const { data: tickerData } = useQuery({
    queryKey: ['forex-ticker'],
    queryFn: () => api<any>('/api/forex/ticker'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })

  const tickerItems = (tickerData?.data ?? []).map((t: any) => ({
    symbol: t.symbol,
    price: typeof t.price === 'number' ? (t.symbol.includes('JPY') || t.symbol.includes('IDR') ? t.price.toFixed(2) : t.price.toFixed(4)) : String(t.price ?? '—'),
    change: typeof t.change === 'number' ? `${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%` : String(t.change ?? '0%'),
    up: typeof t.change === 'number' ? t.change >= 0 : true,
  })) ?? STATIC_TICKER

  const doubled = [...tickerItems, ...tickerItems]

  return (
    <div className="h-9 bg-surface-dark/80 backdrop-blur-sm border-t border-border/50 flex items-center overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
        <span className="text-[10px] text-fg-muted font-mono uppercase tracking-widest">Live</span>
      </div>
      <div className="w-px h-4 bg-border/50 shrink-0" />
      <div className="flex-1 overflow-hidden">
        <div className="animate-ticker flex items-center gap-8 whitespace-nowrap px-4">
          {doubled.map((t, i) => (
            <span key={i} className="flex items-center gap-2 text-xs font-mono">
              <span className="text-fg-muted font-semibold">{t.symbol}</span>
              <span className="text-fg">{t.price}</span>
              <span className={t.up ? 'text-primary' : 'text-danger'}>{t.change}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function TopBar() {
  const location = useLocation()
  const current = navItems.find(n => n.to === location.pathname)
  return (
    <div className="h-11 bg-surface-dark/60 backdrop-blur-sm border-b border-border/50 flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <h1 className="text-[13px] font-semibold text-fg tracking-wide">
          {current?.label || 'Aegis Terminal'}
        </h1>
        <div className="w-px h-4 bg-border/40" />
        <span className="text-[10px] text-fg-placeholder font-mono">v0.1.0</span>
      </div>
      <div className="flex items-center gap-1">
        <button className="flex items-center gap-2 px-3 py-1.5 bg-surface/60 border border-border/40 rounded-lg text-xs text-fg-muted hover:border-border-hover hover:text-fg-secondary transition-all">
          <Search size={13} />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="ml-3 flex items-center gap-0.5 text-[10px] text-fg-placeholder bg-canvas/50 px-1.5 py-0.5 rounded border border-border-subtle/50">
            <Command size={9} /> K
          </kbd>
        </button>
        <button className="p-2 text-fg-muted hover:text-primary transition-colors rounded-lg hover:bg-primary-bg">
          <Bell size={15} />
        </button>
        <button className="p-2 text-fg-muted hover:text-fg-secondary transition-colors rounded-lg hover:bg-surface-hover">
          <Settings size={15} />
        </button>
      </div>
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="w-52 shrink-0 bg-surface-dark/40 backdrop-blur-sm border-r border-border/50 flex flex-col">
      {/* Logo */}
      <div className="h-11 flex items-center px-4 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <span className="text-primary text-sm font-bold">A</span>
          </div>
          <div>
            <span className="text-primary font-bold text-[13px] tracking-tight font-mono">AEGIS</span>
            <span className="text-[9px] text-fg-placeholder ml-1.5 font-mono">PRO</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-glow flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all group ${
                  isActive
                    ? 'active text-primary font-medium'
                    : 'text-fg-muted hover:text-fg-secondary hover:bg-surface-hover/50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? 'text-primary drop-shadow-[0_0_6px_rgba(62,207,142,0.4)]' : 'group-hover:text-fg-secondary'} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border/50">
        <div className="flex items-center gap-2 text-[11px] text-fg-muted">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span className="font-mono">Connected</span>
          <span className="ml-auto text-[10px] text-fg-placeholder font-mono">API</span>
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex h-screen bg-canvas text-fg overflow-hidden ambient-bg">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <main className="flex-1 overflow-auto">
              <Routes>
                <Route path="/" element={<Home_ />} />
                <Route path="/market" element={<Market />} />
                <Route path="/scanner" element={<Scanner />} />
                <Route path="/chart" element={<Chart />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/ai" element={<AI />} />
                <Route path="/macro" element={<Macro />} />
                <Route path="/decision" element={<Decision />} />
                <Route path="/rates" element={<Rates />} />
              </Routes>
            </main>
            <TickerBar />
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
