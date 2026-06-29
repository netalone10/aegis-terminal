import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Home, BarChart3, Crosshair, Globe, BookOpen, ScanLine, CandlestickChart,
  Briefcase, Bot, DollarSign, Sparkles, Calendar as CalendarIcon, Calculator,
  Timer, Layers, Grid3x3, Map, FileText, FlaskConical, Activity
} from 'lucide-react'
import TopBar from './components/TopBar'
import HomeModule from './modules/home/Home'
import Market from './modules/market/Market'
import Decision from './modules/analysis/Decision'
import Confluence from './modules/analysis/Confluence'
import Macro from './modules/analysis/Macro'
import Scanner from './modules/scanner/Scanner'
import Screener from './modules/analysis/Screener'
import Chart from './modules/analysis/Chart'
import Portfolio from './modules/portfolio/Portfolio'
import TradeManager from './modules/portfolio/TradeManager'
import Journal from './modules/analysis/Journal'
import AI from './modules/analysis/AI'
import Rates from './modules/analysis/Rates'
import Landing from './modules/landing/Landing'
import RiskCalc from './modules/analysis/RiskCalc'
import KillZone from './modules/analysis/KillZone'
import Sentiment from './modules/analysis/Sentiment'
import Calendar from './modules/analysis/Calendar'
import Backtest from './modules/analysis/Backtest'
import SessionAnalytics from './modules/analysis/SessionAnalytics'
import StructureMap from './modules/analysis/StructureMap'
import Correlation from './modules/analysis/Correlation'
import TradePlan from './modules/analysis/TradePlan'

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
  { to: '/', label: 'Beranda', icon: Home },
  { to: '/market', label: 'Market', icon: BarChart3 },
  { to: '/plan', label: 'Rencana', icon: FileText },
  { to: '/decision', label: 'SMC', icon: Crosshair },
  { to: '/confluence', label: 'Konfluens', icon: Layers },
  { to: '/screener', label: 'Screener', icon: ScanLine },
  { to: '/macro', label: 'Makro', icon: Globe },
  { to: '/journal', label: 'Jurnal', icon: BookOpen },
  { to: '/risk', label: 'Risiko', icon: Calculator },
  { to: '/killzone', label: 'KillZone', icon: Timer },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/chart', label: 'Chart', icon: CandlestickChart },
  { to: '/portfolio', label: 'Portofolio', icon: Briefcase },
  { to: '/correlation', label: 'Korelasi', icon: Grid3x3 },
  { to: '/structure', label: 'Struktur', icon: Map },
  { to: '/sentiment', label: 'Sentimen', icon: Activity },
  { to: '/trades', label: 'Trade', icon: Activity },
  { to: '/ai', label: 'AI', icon: Bot },
  { to: '/rates', label: 'Rate', icon: DollarSign },
  { to: '/calendar', label: 'Kalender', icon: CalendarIcon },
  { to: '/sessions', label: 'Sesi', icon: BarChart3 },
  { to: '/backtest', label: 'Backtest', icon: FlaskConical },
  { to: '/about', label: 'Tentang', icon: Sparkles },
]

function AppShell() {
  return (
    <div className="kt-page">
      <div className="kt-shell">
        <TopBar navItems={navItems} />
        <main className="kt-main">
          <Routes>
            <Route path="/" element={<HomeModule />} />
            <Route path="/market" element={<Market />} />
            <Route path="/plan" element={<TradePlan />} />
            <Route path="/decision" element={<Decision />} />
            <Route path="/confluence" element={<Confluence />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/macro" element={<Macro />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/risk" element={<RiskCalc />} />
            <Route path="/killzone" element={<KillZone />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/correlation" element={<Correlation />} />
            <Route path="/structure" element={<StructureMap />} />
            <Route path="/sentiment" element={<Sentiment />} />
            <Route path="/trades" element={<TradeManager />} />
            <Route path="/ai" element={<AI />} />
            <Route path="/rates" element={<Rates />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/sessions" element={<SessionAnalytics />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/about" element={<Landing />} />
          </Routes>
        </main>
        <footer style={{
          textAlign: 'center', padding: '12px 16px', fontSize: 11, color: 'var(--kt-muted)',
          borderTop: '1px solid var(--kt-border)', lineHeight: 1.5, flexShrink: 0,
        }}>
          ⚠️ Aegis Terminal bukan penasihat keuangan. Trading forex, emas, dan aset lainnya memiliki risiko tinggi. Anda bertanggung jawab penuh atas setiap keputusan trading.
        </footer>
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
