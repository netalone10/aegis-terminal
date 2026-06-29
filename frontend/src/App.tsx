import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Home, BarChart3, Crosshair, Globe, BookOpen, ScanLine, CandlestickChart, Briefcase, Bot, DollarSign, Sparkles } from 'lucide-react'
import TopBar from './components/TopBar'
import HomeModule from './modules/home/Home'
import Market from './modules/market/Market'
import Decision from './modules/analysis/Decision'
import Macro from './modules/analysis/Macro'
import Scanner from './modules/scanner/Scanner'
import Chart from './modules/analysis/Chart'
import Portfolio from './modules/portfolio/Portfolio'
import Journal from './modules/analysis/Journal'
import AI from './modules/analysis/AI'
import Rates from './modules/analysis/Rates'
import Landing from './modules/landing/Landing'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300_000,
      gcTime: 600_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/market', label: 'Market', icon: BarChart3 },
  { to: '/decision', label: 'SMC', icon: Crosshair },
  { to: '/macro', label: 'Macro', icon: Globe },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/chart', label: 'Chart', icon: CandlestickChart },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/ai', label: 'AI', icon: Bot },
  { to: '/rates', label: 'Rates', icon: DollarSign },
  { to: '/about', label: 'About', icon: Sparkles },
]

const titles: Record<string, string> = {
  '/': 'Terminal Home',
  '/market': 'Market Overview',
  '/decision': 'SMC / ICT Engine',
  '/macro': 'Macro Regime',
  '/journal': 'Trading Journal',
  '/scanner': 'Scanner',
  '/chart': 'Chart Lab',
  '/portfolio': 'Portfolio',
  '/ai': 'AI Assistant',
  '/rates': 'Rates & Bonds',
  '/about': 'About Aegis Terminal',
}

function AppShell() {
  const location = useLocation()

  return (
    <div className="kt-page">
      <div className="kt-shell">
        <TopBar navItems={navItems} />

        <div className="kt-route-head">
          <div>
            <p className="kt-kicker">AEGIS TERMINAL / {location.pathname === '/' ? 'HOME' : location.pathname.replace('/', '').toUpperCase()}</p>
            <h1>{titles[location.pathname] ?? 'Aegis Terminal'}</h1>
          </div>
          <div className="kt-route-actions">
            <span className="kt-status-dot" />
            <span>LIVE DATA</span>
          </div>
        </div>

        <main className="kt-main">
          <Routes>
            <Route path="/" element={<HomeModule />} />
            <Route path="/market" element={<Market />} />
            <Route path="/decision" element={<Decision />} />
            <Route path="/macro" element={<Macro />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/ai" element={<AI />} />
            <Route path="/rates" element={<Rates />} />
            <Route path="/about" element={<Landing />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
