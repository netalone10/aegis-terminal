import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Home, BarChart3, Crosshair, Globe, BookOpen, ScanLine, CandlestickChart,
  Briefcase, Bot, DollarSign, Sparkles, Calendar as CalendarIcon, Calculator,
  Timer, Layers, Grid3x3, Map, FileText, FlaskConical, Activity, ScrollText
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
import SessionReport from './modules/analysis/SessionReport'
import StructureMap from './modules/analysis/StructureMap'
import Correlation from './modules/analysis/Correlation'
import TradePlan from './modules/analysis/TradePlan'
import AnalysisNarrative from './modules/analysis/AnalysisNarrative'

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
  { to: '/plan', label: 'Plan', icon: FileText },
  { to: '/decision', label: 'SMC', icon: Crosshair },
  { to: '/confluence', label: 'Confluence', icon: Layers },
  { to: '/screener', label: 'Screener', icon: ScanLine },
  { to: '/macro', label: 'Macro', icon: Globe },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/risk', label: 'Risk', icon: Calculator },
  { to: '/killzone', label: 'KillZone', icon: Timer },
  { to: '/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/chart', label: 'Chart', icon: CandlestickChart },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/correlation', label: 'Correlation', icon: Grid3x3 },
  { to: '/structure', label: 'Structure', icon: Map },
  { to: '/sentiment', label: 'Sentiment', icon: Activity },
  { to: '/trades', label: 'Trade', icon: Activity },
  { to: '/ai', label: 'AI', icon: Bot },
  { to: '/rates', label: 'Rates', icon: DollarSign },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/sessions', label: 'Sessions', icon: BarChart3 },
  { to: '/session-report', label: 'Report', icon: BarChart3 },
  { to: '/backtest', label: 'Backtest', icon: FlaskConical },
  { to: '/narrative', label: 'Narrative', icon: ScrollText },
  { to: '/about', label: 'About', icon: Sparkles },
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
            <Route path="/session-report" element={<SessionReport />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/narrative" element={<AnalysisNarrative />} />
            <Route path="/about" element={<Landing />} />
          </Routes>
        </main>
        <footer style={{
          textAlign: 'center', padding: '12px 16px', fontSize: 11, color: 'var(--kt-muted)',
          borderTop: '1px solid var(--kt-border)', lineHeight: 1.5, flexShrink: 0,
        }}>
          ⚠️ Aegis Terminal is not financial advice. Trading forex, gold, and other assets carries high risk. You are fully responsible for every trading decision.
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
