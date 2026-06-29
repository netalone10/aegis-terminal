import { TrendingUp, TrendingDown, ExternalLink, Newspaper, Zap } from 'lucide-react'

const summaryCards = [
  { symbol: 'IHSG', name: 'IDX Composite', price: '7,234.5', change: '+0.31%', up: true },
  { symbol: 'S&P500', name: 'S&P 500', price: '5,460.2', change: '+0.18%', up: true },
  { symbol: 'BTC', name: 'Bitcoin', price: '$59,748', change: '-0.14%', up: false },
  { symbol: 'XAU', name: 'Gold', price: '$3,275', change: '-0.22%', up: false },
]

const topMovers = {
  gainers: [
    { symbol: 'ADRO', change: '+4.2%', price: '2,850' },
    { symbol: 'BBRI', change: '+2.8%', price: '4,520' },
    { symbol: 'TLKM', change: '+2.1%', price: '2,680' },
  ],
  losers: [
    { symbol: 'EXCL', change: '-3.1%', price: '1,920' },
    { symbol: 'INDF', change: '-2.4%', price: '5,750' },
    { symbol: 'KLBF', change: '-1.8%', price: '1,340' },
  ],
}

const newsItems = [
  { title: 'Fed signals potential rate cut in September meeting', source: 'Reuters', time: '2h ago' },
  { title: 'IDX closes higher on foreign buying momentum', source: 'Bloomberg', time: '3h ago' },
  { title: 'Bitcoin consolidates around $60K as ETF inflows slow', source: 'CoinDesk', time: '4h ago' },
  { title: 'BI holds rate at 6.25%, signals dovish outlook', source: 'CNBC', time: '5h ago' },
  { title: 'Gold retreats as dollar strengthens on jobs data', source: 'MarketWatch', time: '6h ago' },
]

function SummaryCard({ symbol, name, price, change, up }: typeof summaryCards[0]) {
  return (
    <div className="bg-default border border-border rounded-lg p-4 hover:border-border-hover transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-fg-muted font-mono uppercase">{symbol}</span>
        {up ? <TrendingUp size={14} className="text-primary" /> : <TrendingDown size={14} className="text-danger" />}
      </div>
      <div className="text-xl font-semibold font-mono">{price}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-fg-muted">{name}</span>
        <span className={`text-sm font-mono font-medium ${up ? 'text-primary' : 'text-danger'}`}>{change}</span>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-fg-muted mt-0.5">Market overview & quick actions</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-muted font-mono">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span>Market Open</span>
          <span className="text-fg-placeholder">|</span>
          <span>Last update: just now</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {summaryCards.map(card => <SummaryCard key={card.symbol} {...card} />)}
      </div>

      {/* Main Grid: Heatmap + News + Movers */}
      <div className="grid grid-cols-3 gap-4">
        {/* Heatmap */}
        <div className="col-span-2 bg-default border border-border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">Sector Heatmap</span>
            <span className="text-xs text-fg-muted">IDX</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { name: 'Banking', pct: '+1.2%', up: true, size: 'col-span-2 row-span-2' },
                { name: 'Mining', pct: '+0.8%', up: true, size: '' },
                { name: 'Telco', pct: '+0.5%', up: true, size: '' },
                { name: 'Consumer', pct: '-0.3%', up: false, size: '' },
                { name: 'Property', pct: '-0.7%', up: false, size: '' },
                { name: 'Infrastructure', pct: '+0.2%', up: true, size: 'col-span-2' },
              ].map(sector => (
                <div
                  key={sector.name}
                  className={`${sector.size} ${sector.up ? 'bg-primary/10 border-primary/20' : 'bg-danger/10 border-danger/20'} border rounded-md p-3 flex flex-col justify-between min-h-[60px]`}
                >
                  <span className="text-xs text-fg-secondary">{sector.name}</span>
                  <span className={`text-sm font-mono font-medium ${sector.up ? 'text-primary' : 'text-danger'}`}>
                    {sector.pct}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: News + Movers */}
        <div className="space-y-4">
          {/* Top Movers */}
          <div className="bg-default border border-border rounded-lg">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Zap size={14} className="text-warning" />
              <span className="text-sm font-medium">Top Movers</span>
            </div>
            <div className="p-3 space-y-1">
              <div className="text-[10px] text-fg-muted uppercase tracking-wider px-2 py-1">Gainers</div>
              {topMovers.gainers.map(s => (
                <div key={s.symbol} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-hover">
                  <span className="text-sm font-mono">{s.symbol}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-muted font-mono">{s.price}</span>
                    <span className="text-xs font-mono text-primary">{s.change}</span>
                  </div>
                </div>
              ))}
              <div className="text-[10px] text-fg-muted uppercase tracking-wider px-2 py-1 mt-2">Losers</div>
              {topMovers.losers.map(s => (
                <div key={s.symbol} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-hover">
                  <span className="text-sm font-mono">{s.symbol}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-muted font-mono">{s.price}</span>
                    <span className="text-xs font-mono text-danger">{s.change}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* News */}
          <div className="bg-default border border-border rounded-lg">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Newspaper size={14} className="text-info" />
              <span className="text-sm font-medium">Headlines</span>
            </div>
            <div className="divide-y divide-border-subtle">
              {newsItems.map((item, i) => (
                <div key={i} className="px-4 py-2.5 hover:bg-surface-hover transition-colors cursor-pointer">
                  <p className="text-xs text-fg leading-relaxed">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-fg-muted">{item.source}</span>
                    <span className="text-[10px] text-fg-placeholder">•</span>
                    <span className="text-[10px] text-fg-placeholder">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        <a href="/scanner" className="flex items-center gap-2 px-4 py-2 bg-primary text-canvas text-sm font-medium rounded-md hover:bg-primary-hover transition-colors">
          Open Scanner
        </a>
        <a href="/journal" className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-sm text-fg-secondary rounded-md hover:border-border-hover transition-colors">
          New Journal Entry
        </a>
        <a href="/ai" className="flex items-center gap-2 px-4 py-2 bg-surface border border-border text-sm text-fg-secondary rounded-md hover:border-border-hover transition-colors">
          AI Chat
        </a>
      </div>
    </div>
  )
}
