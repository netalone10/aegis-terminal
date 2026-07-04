import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { ChevronDown, ChevronRight, Menu, X, Home, CandlestickChart, Crosshair, Timer, Calendar, ScanLine, BookOpen, DollarSign, Newspaper, Building2, Briefcase, Zap, BarChart3 } from 'lucide-react'
import { useState } from 'react'

type NavItem = { to: string; label: string; icon: LucideIcon }
type NavGroup = { label: string; items: NavItem[] }

const NEW_NAV_GROUPS: NavGroup[] = [
  {
    label: 'CORE',
    items: [
      { to: '/terminal', label: 'Dashboard', icon: Home },
      { to: '/chart', label: 'Charts', icon: CandlestickChart },
    ],
  },
  {
    label: 'ANALYSIS',
    items: [
      { to: '/smc', label: 'SMC', icon: Crosshair },
      { to: '/killzone', label: 'Kill Zone', icon: Timer },
      { to: '/screening', label: 'Screening', icon: ScanLine },
      { to: '/signals', label: 'Signals', icon: Zap },
      { to: '/weekly-outlook', label: 'Weekly Outlook', icon: Calendar },
      { to: '/daily-outlook', label: 'Daily Outlook', icon: BarChart3 },
      { to: '/fundamental', label: 'Fundamental', icon: BarChart3 },
    ],
  },
  {
    label: 'DATA',
    items: [
      { to: '/calendar', label: 'Calendar', icon: Calendar },
      { to: '/rates', label: 'Rates', icon: DollarSign },
      { to: '/news', label: 'News', icon: Newspaper },
      { to: '/research', label: 'Research', icon: Building2 },
    ],
  },
  {
    label: 'JOURNAL',
    items: [
      { to: '/journal', label: 'Journal', icon: BookOpen },
    ],
  },
  {
    label: 'PORTFOLIO',
    items: [
      { to: '/portfolio', label: 'Trade Manager', icon: Briefcase },
      { to: '/market', label: 'Market', icon: CandlestickChart },
    ],
  },
]

export default function TopBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    CORE: true, ANALYSIS: true, DATA: true, JOURNAL: true,
  })

  const { data: tickerData } = useQuery<any>({
    queryKey: ['forex-ticker'],
    queryFn: () => api('/api/forex/ticker'),
    staleTime: 300_000,
    refetchInterval: 60_000,
    retry: false,
  })

  const raw = Array.isArray(tickerData) ? tickerData : (tickerData?.data ?? [])
  const tickerItems = raw.length > 0
    ? raw.slice(0, 8).map((t: any) => ({
        symbol: t.symbol,
        price: typeof t.price === 'number'
          ? (t.symbol.includes('JPY') || t.symbol.includes('IDR') ? t.price.toFixed(2) : t.price.toFixed(4))
          : String(t.price ?? '—'),
        change: typeof t.change === 'number'
          ? `${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%`
          : String(t.change ?? '0%'),
        up: typeof t.change === 'number' ? t.change >= 0 : true,
      }))
    : []

  const doubled = [...tickerItems, ...tickerItems]

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <>
      {/* Slim top bar — brand + hamburger + connected status */}
      <header className="kt-topbar" style={{ height: 44, padding: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--kt-text)', display: 'flex', alignItems: 'center',
            }}
            aria-label="Toggle navigation"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <NavLink to="/" className="kt-brand" aria-label="Aegis Terminal home">
            <span className="kt-brand-mark">AG</span>
            <span className="kt-brand-text">AEGIS</span>
          </NavLink>
        </div>
        <div className="kt-top-actions">
          <span className="kt-pill kt-pill-gold">Connected</span>
        </div>
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 90, backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          position: 'fixed', top: 0, left: sidebarOpen ? 0 : -280,
          width: 280, height: '100vh', background: 'var(--kt-bg)',
          borderRight: '1px solid var(--kt-border)', zIndex: 95,
          transition: 'left 0.2s ease', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--kt-border)',
        }}>
          <NavLink to="/" className="kt-brand" onClick={() => setSidebarOpen(false)}>
            <span className="kt-brand-mark">AG</span>
            <span className="kt-brand-text">AEGIS TERMINAL</span>
          </NavLink>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--kt-muted)', cursor: 'pointer', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Home link */}
        <NavLink
          to="/"
          end
          onClick={() => setSidebarOpen(false)}
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 16px', textDecoration: 'none', fontWeight: 600, fontSize: 'var(--sm)',
            color: isActive ? 'var(--kt-gold)' : 'var(--kt-text)',
            background: isActive ? 'rgba(255,191,0,0.06)' : 'transparent',
            borderLeft: isActive ? '2px solid var(--kt-gold)' : '2px solid transparent',
          })}
        >
          <Home size={15} />
          <span>HOME</span>
        </NavLink>

        {/* Grouped nav — 10 pages */}
        {NEW_NAV_GROUPS.map(group => (
          <div key={group.label}>
            <button
              onClick={() => toggleGroup(group.label)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '10px 16px', background: 'none',
                border: 'none', borderBottom: '1px solid var(--kt-border)',
                color: 'var(--kt-muted)', fontSize: 'var(--xs)',
                fontFamily: 'var(--font-mono)', fontWeight: 700,
                letterSpacing: '0.05em', cursor: 'pointer',
              }}
            >
              <span>{group.label}</span>
              {expandedGroups[group.label] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {expandedGroups[group.label] && group.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 16px 9px 24px',
                  color: isActive ? 'var(--kt-gold)' : 'var(--kt-text2)',
                  textDecoration: 'none', fontSize: 'var(--sm)',
                  background: isActive ? 'rgba(255,191,0,0.06)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--kt-gold)' : '2px solid transparent',
                })}
              >
                <Icon size={14} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      {/* Ticker bar */}
      <div className="kt-ticker">
        <div className="kt-ticker-label">LIVE</div>
        <div className="kt-ticker-track">
          <div className="kt-ticker-inner">
            {doubled.map((t, i) => (
              <span className="kt-tick" key={`${t.symbol}-${i}`}>
                <b>{t.symbol}</b>
                <em>{t.price}</em>
                <i className={t.up ? 'up' : 'dn'}>{t.change}</i>
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
