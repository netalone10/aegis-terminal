import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'

const STATIC_TICKER = [
  { symbol: 'XAU/USD', price: '4,018.00', change: '-1.72%', up: false },
  { symbol: 'EUR/USD', price: '1.1414', change: '+0.25%', up: true },
  { symbol: 'GBP/USD', price: '1.3239', change: '+0.34%', up: true },
  { symbol: 'USD/JPY', price: '161.91', change: '+0.33%', up: true },
]

type NavItem = { to: string; label: string; icon: LucideIcon }

export default function TopBar({ navItems }: { navItems: NavItem[] }) {
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
    : STATIC_TICKER

  const doubled = [...tickerItems, ...tickerItems]

  return (
    <>
      <header className="kt-topbar">
        <NavLink to="/" className="kt-brand" aria-label="Aegis Terminal home">
          <span className="kt-brand-mark">AG</span>
          <span className="kt-brand-text">AEGIS</span>
        </NavLink>

        <nav className="kt-nav" aria-label="Main navigation">
          {navItems.slice(0, 6).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={13} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="kt-top-actions">
          <span className="kt-pill">V3.0</span>
          <span className="kt-pill kt-pill-gold">Connected</span>
        </div>
      </header>

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
