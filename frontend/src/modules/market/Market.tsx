import { useState } from 'react'
import { TrendingUp, TrendingDown, ArrowUpDown, Search } from 'lucide-react'

type Tab = 'IDX' | 'US' | 'Crypto' | 'Forex'

const tabs: Tab[] = ['IDX', 'US', 'Crypto', 'Forex']

const mockData: Record<Tab, { symbol: string; name: string; price: string; change: string; volume: string; up: boolean }[]> = {
  IDX: [
    { symbol: 'BBCA', name: 'Bank Central Asia', price: '9,850', change: '+0.51%', volume: '12.5M', up: true },
    { symbol: 'BBRI', name: 'Bank Rakyat Indonesia', price: '4,520', change: '+2.80%', volume: '18.2M', up: true },
    { symbol: 'TLKM', name: 'Telkom Indonesia', price: '2,680', change: '+2.10%', volume: '15.1M', up: true },
    { symbol: 'ADRO', name: 'Adaro Energy', price: '2,850', change: '+4.20%', volume: '22.3M', up: true },
    { symbol: 'BMRI', name: 'Bank Mandiri', price: '6,750', change: '+1.50%', volume: '8.4M', up: true },
    { symbol: 'EXCL', name: 'XL Axiata', price: '1,920', change: '-3.10%', volume: '9.1M', up: false },
    { symbol: 'INDF', name: 'Indofood Sukses', price: '5,750', change: '-2.40%', volume: '3.2M', up: false },
    { symbol: 'KLBF', name: 'Kalbe Farma', price: '1,340', change: '-1.80%', volume: '5.7M', up: false },
    { symbol: 'ASII', name: 'Astra International', price: '4,890', change: '+0.82%', volume: '6.8M', up: true },
    { symbol: 'UNVR', name: 'Unilever Indonesia', price: '2,150', change: '-0.46%', volume: '4.1M', up: false },
  ],
  US: [
    { symbol: 'AAPL', name: 'Apple Inc', price: '$195.40', change: '+0.72%', volume: '52.1M', up: true },
    { symbol: 'MSFT', name: 'Microsoft Corp', price: '$445.20', change: '+0.35%', volume: '18.3M', up: true },
    { symbol: 'NVDA', name: 'NVIDIA Corp', price: '$125.80', change: '+1.20%', volume: '312M', up: true },
    { symbol: 'GOOGL', name: 'Alphabet Inc', price: '$178.90', change: '-0.15%', volume: '22.4M', up: false },
    { symbol: 'AMZN', name: 'Amazon.com', price: '$186.50', change: '+0.48%', volume: '45.2M', up: true },
    { symbol: 'TSLA', name: 'Tesla Inc', price: '$248.60', change: '-1.30%', volume: '98.5M', up: false },
  ],
  Crypto: [
    { symbol: 'BTC', name: 'Bitcoin', price: '$59,748', change: '-0.14%', volume: '$28.5B', up: false },
    { symbol: 'ETH', name: 'Ethereum', price: '$3,450', change: '+0.45%', volume: '$12.1B', up: true },
    { symbol: 'SOL', name: 'Solana', price: '$142.30', change: '+2.10%', volume: '$3.2B', up: true },
    { symbol: 'BNB', name: 'BNB', price: '$598.40', change: '+0.28%', volume: '$1.8B', up: true },
    { symbol: 'XRP', name: 'Ripple', price: '$0.52', change: '-0.75%', volume: '$1.1B', up: false },
    { symbol: 'ADA', name: 'Cardano', price: '$0.45', change: '+1.20%', volume: '$420M', up: true },
  ],
  Forex: [
    { symbol: 'USD/IDR', name: 'US Dollar / Rupiah', price: '16,234', change: '+0.05%', volume: '—', up: true },
    { symbol: 'EUR/USD', name: 'Euro / US Dollar', price: '1.0845', change: '-0.12%', volume: '—', up: false },
    { symbol: 'GBP/USD', name: 'Pound / US Dollar', price: '1.2720', change: '+0.08%', volume: '—', up: true },
    { symbol: 'USD/JPY', name: 'US Dollar / Yen', price: '159.80', change: '+0.22%', volume: '—', up: true },
    { symbol: 'XAU/USD', name: 'Gold / US Dollar', price: '3,275', change: '-0.22%', volume: '—', up: false },
    { symbol: 'XAG/USD', name: 'Silver / US Dollar', price: '29.15', change: '+0.35%', volume: '—', up: true },
  ],
}

export default function Market() {
  const [activeTab, setActiveTab] = useState<Tab>('IDX')
  const [search, setSearch] = useState('')
  const data = mockData[activeTab].filter(d =>
    d.symbol.toLowerCase().includes(search.toLowerCase()) ||
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Market Overview</h1>
          <p className="text-sm text-fg-muted mt-0.5">Real-time prices across all markets</p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-default border border-border rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-canvas font-medium'
                  : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-default border border-border rounded-md w-64">
          <Search size={14} className="text-fg-muted" />
          <input
            type="text"
            placeholder="Search symbol..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-fg placeholder:text-fg-placeholder outline-none flex-1"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-default border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-dark border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                <button className="flex items-center gap-1 hover:text-fg transition-colors">
                  Symbol <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Name</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                <button className="flex items-center gap-1 hover:text-fg transition-colors ml-auto">
                  Price <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">
                <button className="flex items-center gap-1 hover:text-fg transition-colors ml-auto">
                  Change <ArrowUpDown size={10} />
                </button>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.map(row => (
              <tr key={row.symbol} className="hover:bg-surface-hover transition-colors cursor-pointer">
                <td className="px-4 py-3">
                  <span className="font-mono font-medium text-sm">{row.symbol}</span>
                </td>
                <td className="px-4 py-3 text-sm text-fg-secondary">{row.name}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{row.price}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`inline-flex items-center gap-1 font-mono text-sm ${row.up ? 'text-primary' : 'text-danger'}`}>
                    {row.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {row.change}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-fg-muted">{row.volume}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
