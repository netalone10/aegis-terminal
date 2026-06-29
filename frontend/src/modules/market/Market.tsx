import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, ArrowUpDown, Search, Globe } from 'lucide-react'
import { api } from '../../lib/api'

type Tab = 'Forex' | 'IDX' | 'US' | 'Crypto'
const tabs: Tab[] = ['Forex', 'IDX', 'US', 'Crypto']

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

const STATIC_DATA: Record<Tab, any[]> = {
  IDX: [
    { symbol: 'BBCA', name: 'Bank Central Asia', price: '9,850', change: '+0.51%', volume: '12.5M', up: true },
    { symbol: 'BBRI', name: 'Bank Rakyat Indonesia', price: '4,520', change: '+2.80%', volume: '18.2M', up: true },
    { symbol: 'TLKM', name: 'Telkom Indonesia', price: '2,680', change: '+2.10%', volume: '15.1M', up: true },
    { symbol: 'ADRO', name: 'Adaro Energy', price: '2,850', change: '+4.20%', volume: '22.3M', up: true },
    { symbol: 'BMRI', name: 'Bank Mandiri', price: '6,750', change: '+1.50%', volume: '8.4M', up: true },
    { symbol: 'EXCL', name: 'XL Axiata', price: '1,920', change: '-3.10%', volume: '9.1M', up: false },
    { symbol: 'INDF', name: 'Indofood Sukses', price: '5,750', change: '-2.40%', volume: '3.2M', up: false },
    { symbol: 'KLBF', name: 'Kalbe Farma', price: '1,340', change: '-1.80%', volume: '5.7M', up: false },
  ],
  US: [
    { symbol: 'AAPL', name: 'Apple Inc', price: '$195.40', change: '+0.72%', volume: '52.1M', up: true },
    { symbol: 'MSFT', name: 'Microsoft Corp', price: '$445.20', change: '+0.35%', volume: '18.3M', up: true },
    { symbol: 'NVDA', name: 'NVIDIA Corp', price: '$125.80', change: '+1.20%', volume: '312M', up: true },
    { symbol: 'TSLA', name: 'Tesla Inc', price: '$248.60', change: '-1.30%', volume: '98.5M', up: false },
  ],
  Crypto: [
    { symbol: 'BTC', name: 'Bitcoin', price: '$59,748', change: '-0.14%', volume: '$28.5B', up: false },
    { symbol: 'ETH', name: 'Ethereum', price: '$3,450', change: '+0.45%', volume: '$12.1B', up: true },
    { symbol: 'SOL', name: 'Solana', price: '$142.30', change: '+2.10%', volume: '$3.2B', up: true },
  ],
  Forex: [
    { symbol: 'USD/IDR', name: 'US Dollar / Rupiah', price: '16,234', change: '+0.05%', volume: '—', up: true },
    { symbol: 'XAU/USD', name: 'Gold / US Dollar', price: '3,275', change: '-0.22%', volume: '—', up: false },
  ],
}

function TableSkeleton() {
  return (
    <div className="space-y-0">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center px-5 py-4 gap-4">
          <Skeleton className="w-14 h-4" />
          <Skeleton className="w-36 h-4" />
          <Skeleton className="ml-auto w-20 h-4" />
          <Skeleton className="ml-auto w-16 h-4" />
          <Skeleton className="ml-auto w-14 h-4" />
        </div>
      ))}
    </div>
  )
}

export default function Market() {
  const [activeTab, setActiveTab] = useState<Tab>('Forex')
  const [search, setSearch] = useState('')

  const { data: scanData, isLoading } = useQuery({
    queryKey: ['market-scan', activeTab],
    queryFn: () => api<any[]>(`/api/market/scan?exchange=${activeTab}`),
    enabled: activeTab === 'IDX',
    staleTime: 30_000,
    retry: false,
  })

  const apiRows = (activeTab === 'IDX' && scanData) ? scanData.map((s: any) => ({
    symbol: s.symbol ?? '—',
    name: s.name ?? s.symbol ?? '—',
    price: typeof s.price === 'number' ? s.price.toLocaleString() : String(s.price ?? '—'),
    change: typeof s.change === 'number' ? `${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%` : String(s.change ?? '0%'),
    volume: typeof s.volume === 'number' ? (s.volume >= 1e9 ? `${(s.volume / 1e9).toFixed(1)}B` : s.volume >= 1e6 ? `${(s.volume / 1e6).toFixed(1)}M` : s.volume.toLocaleString()) : String(s.volume ?? '—'),
    up: typeof s.change === 'number' ? s.change >= 0 : true,
  })) : null

  const rows = apiRows ?? STATIC_DATA[activeTab]
  const data = rows.filter(d =>
    d.symbol.toLowerCase().includes(search.toLowerCase()) ||
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Market Overview</h1>
          <p className="text-[13px] text-fg-muted mt-1">Real-time prices across all markets</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-muted font-mono">
          <Globe size={14} className="text-info" />
          <span>{data.length} instruments</span>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface-dark/60 backdrop-blur-sm border border-border/40 rounded-xl p-1">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-1.5 text-[13px] rounded-lg transition-all font-medium ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-primary to-primary-hover text-canvas shadow-[0_0_12px_rgba(62,207,142,0.2)]'
                  : 'text-fg-muted hover:text-fg hover:bg-surface-hover/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 glass rounded-lg w-72">
          <Search size={14} className="text-fg-placeholder" />
          <input
            type="text"
            placeholder="Search symbol..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-[13px] text-fg placeholder:text-fg-placeholder outline-none flex-1"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              {['Symbol', 'Name', 'Price', 'Change', 'Volume'].map((h, i) => (
                <th key={h} className={`${i >= 2 ? 'text-right' : 'text-left'} px-5 py-3 text-[10px] font-semibold text-fg-muted uppercase tracking-widest font-mono`}>
                  {i >= 2 && i <= 3 ? (
                    <button className="flex items-center gap-1 hover:text-fg transition-colors ml-auto">
                      {h} <ArrowUpDown size={9} />
                    </button>
                  ) : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && activeTab === 'IDX' ? (
              <tr><td colSpan={5}><TableSkeleton /></td></tr>
            ) : (
              data.map((row) => (
                <tr key={row.symbol} className="table-row-hover cursor-pointer border-b border-border/10 last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-mono font-semibold text-[13px]">{row.symbol}</span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-fg-secondary">{row.name}</td>
                  <td className="px-5 py-3 text-right font-mono text-[13px] font-medium">{row.price}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 font-mono text-[12px] font-semibold px-2 py-0.5 rounded-md ${
                      row.up ? 'text-primary bg-primary/[0.08]' : 'text-danger bg-danger/[0.08]'
                    }`}>
                      {row.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {row.change}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-[11px] text-fg-muted">{row.volume}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
