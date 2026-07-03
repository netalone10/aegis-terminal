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
