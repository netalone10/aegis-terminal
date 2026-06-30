import { NavLink } from 'react-router-dom'
import { Home, BarChart3, Crosshair, Globe, BookOpen, ScanLine, CandlestickChart, Briefcase, Bot, DollarSign } from 'lucide-react'

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
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-surface-deep border-r border-hairline flex flex-col z-50 max-md:hidden">
      <div className="h-14 flex items-center px-5 border-b border-hairline">
        <span className="text-primary font-mono font-bold text-lg tracking-tight">AEGIS</span>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-light transition-colors ${
                isActive
                  ? 'bg-primary-bg text-primary-hover'
                  : 'text-muted hover:text-ink hover:bg-surface-hover'
              }`
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-hairline space-y-1">
        <div className="text-[10px] text-muted font-mono">v0.2.0</div>
        <div className="text-[10px] text-muted font-mono">Data via TradingView</div>
      </div>
    </aside>
  )
}
