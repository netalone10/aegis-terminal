import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Home, BarChart3, ScanLine, CandlestickChart,
  Briefcase, BookOpen, Sparkles, TrendingUp,
  Search, Settings, Bell, Command
} from 'lucide-react'
import { useState, useEffect } from 'react'
import Home_ from './modules/home/Home'
import Market from './modules/market/Market'
import Scanner from './modules/scanner/Scanner'
import Chart from './modules/analysis/Chart'
import Portfolio from './modules/portfolio/Portfolio'
import Journal from './modules/analysis/Journal'
import AI from './modules/analysis/AI'
import Macro from './modules/analysis/Macro'

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
]

const tickerItems = [
  { symbol: 'IHSG', price: '7,234.5', change: '+0.31%', up: true },
  { symbol: 'BTC', price: '$59,748', change: '-0.14%', up: false },
  { symbol: 'XAU', price: '$3,275', change: '-0.22%', up: false },
  { symbol: 'USD/IDR', price: '16,234', change: '+0.05%', up: true },
  { symbol: 'S&P500', price: '5,460', change: '+0.18%', up: true },
  { symbol: 'ETH', price: '$3,450', change: '+0.45%', up: true },
  { symbol: 'AAPL', price: '$195', change: '+0.72%', up: true },
  { symbol: 'BBCA', price: '9,850', change: '+0.51%', up: true },
]

function TickerBar() {
  const doubled = [...tickerItems, ...tickerItems]
  return (
    <div className="h-8 bg-default border-t border-border flex items-center overflow-hidden">
      <div className="flex items-center gap-1 px-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
        <span className="text-[10px] text-fg-muted font-mono uppercase">Live</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="animate-ticker flex items-center gap-6 whitespace-nowrap">
          {doubled.map((t, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-fg-secondary font-medium">{t.symbol}</span>
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
    <div className="h-12 bg-default border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-fg">
          {current?.label || 'Aegis Terminal'}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-md text-xs text-fg-muted hover:border-border-hover transition-colors">
          <Search size={14} />
          <span>Search...</span>
          <kbd className="ml-4 flex items-center gap-0.5 text-[10px] text-fg-placeholder bg-canvas px-1 py-0.5 rounded border border-border-subtle">
            <Command size={10} /> K
          </kbd>
        </button>
        <button className="p-2 text-fg-muted hover:text-fg transition-colors">
          <Bell size={16} />
        </button>
        <button className="p-2 text-fg-muted hover:text-fg transition-colors">
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-default border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-12 flex items-center px-4 border-b border-border">
        <span className="text-primary font-bold text-base tracking-tight font-mono flex items-center gap-2">
          <span className="text-lg">⬡</span> AEGIS
        </span>
        <span className="ml-auto text-[10px] text-fg-placeholder font-mono bg-surface px-1.5 py-0.5 rounded">
          v0.1.0
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm transition-all ${
                  isActive
                    ? 'bg-primary-bg text-primary'
                    : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
                }`
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span>Connected</span>
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex h-screen bg-canvas text-fg overflow-hidden">
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
              </Routes>
            </main>
            <TickerBar />
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
