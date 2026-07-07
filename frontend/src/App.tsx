import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TopBar from './components/TopBar'
import Landing from './modules/landing/Landing'
import Home from './modules/home/Home'
import Chart from './modules/analysis/Chart'
import Decision from './modules/analysis/Decision'
import KillZone from './modules/analysis/KillZone'
import Screener from './modules/analysis/Screener'
import Calendar from './modules/analysis/Calendar'
import Rates from './modules/analysis/Rates'
import HeadlineNews from './modules/analysis/HeadlineNews'
import Research from './modules/analysis/Research'
import Journal from './modules/analysis/Journal'
import Signals from './modules/analysis/Signals'
import WeeklyOutlook from './modules/analysis/WeeklyOutlook'
import DailyOutlook from './modules/analysis/DailyOutlook'
import Fundamental from './modules/analysis/Fundamental'
import MacroDashboard from './modules/macro/MacroDashboard'
import Market from './modules/market/Market'
import Portfolio from './modules/portfolio/Portfolio'
import VpsDashboard from './pages/VpsDashboard'
import { CryptoScreener } from './pages/CryptoScreener'
import { CryptoSignals } from './pages/CryptoSignals'
import { CryptoDetail } from './pages/CryptoDetail'
import { CryptoPerformance } from './pages/CryptoPerformance'
import { BtcScalpDashboard } from './pages/BtcScalpDashboard'

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

function AppShell() {
  return (
    <div className="kt-page">
      <div className="kt-shell">
        <TopBar />
        <main className="kt-main">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/terminal" element={<Home />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/smc" element={<Decision />} />
            <Route path="/killzone" element={<KillZone />} />
            <Route path="/screening" element={<Screener />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/rates" element={<Rates />} />
            <Route path="/news" element={<HeadlineNews />} />
            <Route path="/research" element={<Research />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/weekly-outlook" element={<WeeklyOutlook />} />
            <Route path="/daily-outlook" element={<DailyOutlook />} />
            <Route path="/fundamental" element={<Fundamental />} />
            <Route path="/macro" element={<MacroDashboard />} />
            <Route path="/market" element={<Market />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/vps" element={<VpsDashboard />} />
            <Route path="/crypto" element={<CryptoScreener />} />
            <Route path="/crypto/signals" element={<CryptoSignals />} />
            <Route path="/crypto/:symbol" element={<CryptoDetail />} />
            <Route path="/crypto/performance" element={<CryptoPerformance />} />
            <Route path="/crypto/scalp" element={<BtcScalpDashboard />} />
          </Routes>
        </main>
        <footer style={{
          textAlign: 'center', padding: '12px 16px', fontSize: 11, color: 'var(--kt-muted)',
          borderTop: '1px solid var(--kt-border)', lineHeight: 1.5, flexShrink: 0,
        }}>
          ⚠️ Aegis Terminal is not financial advice. Trading forex, gold, and other assets carries high risk.
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
