import { NavLink } from 'react-router-dom'
import { Home, CandlestickChart, Crosshair, Timer, Calendar, ScanLine, BookOpen, DollarSign, Newspaper, Building2, Briefcase, Zap, BarChart3 } from 'lucide-react'

const navSections = [
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
      { to: '/macro', label: 'Macro', icon: BarChart3 },
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
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-surface-deep border-r border-hairline flex flex-col z-50 max-md:hidden">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-hairline">
        <span className="text-primary font-mono font-bold text-lg tracking-tight">AEGIS</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-4 overflow-y-auto">
        {navSections.map(section => (
          <div key={section.label}>
            <div className="px-3 mb-1 text-[10px] font-mono text-muted uppercase tracking-wider">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
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
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-hairline space-y-1">
        <div className="text-[10px] text-muted font-mono">v0.3.0</div>
        <div className="text-[10px] text-muted font-mono">MT5 + TradingView</div>
      </div>
    </aside>
  )
}
