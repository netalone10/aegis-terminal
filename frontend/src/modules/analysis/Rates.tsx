import { useQuery } from '@tanstack/react-query'
import { DollarSign, AlertTriangle, Activity } from 'lucide-react'
import { api } from '../../lib/api'

type RatesResponse = {
  status: string
  data: {
    rates: Record<string, number | null>
    spreads: { '2Y-10Y': string | null; '3M-10Y': string | null }
    curveShape: string
  }
}

const rateLabels: Record<string, string> = {
  '3M': '3-Month T-Bill', '6M': '6-Month T-Bill', '1Y': '1-Year Treasury',
  '2Y': '2-Year Treasury', '5Y': '5-Year Treasury', '10Y': '10-Year Treasury', '30Y': '30-Year Treasury',
}

function RateCard({ name, value }: { name: string; value: number | null }) {
  return (
    <div className="glass glass-hover gradient-border p-5">
      <span className="text-[11px] text-fg-muted font-mono uppercase tracking-widest">{rateLabels[name] || name}</span>
      <div className="mt-3">
        <span className="text-3xl font-bold font-mono text-fg">
          {value != null ? `${value.toFixed(2)}%` : 'N/A'}
        </span>
      </div>
    </div>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

function RatesSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="w-48 h-6" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-36 rounded-xl" />
    </div>
  )
}

export default function Rates() {
  const { data: res, isLoading } = useQuery<RatesResponse>({
    queryKey: ['rates'],
    queryFn: () => api('/api/macro/rates'),
    refetchInterval: 300_000,
    retry: false,
  })

  if (isLoading) return <RatesSkeleton />

  const data = res?.data
  const spread10y2y = data?.spreads?.['2Y-10Y'] ? parseFloat(data.spreads['2Y-10Y']) : null
  const inverted = spread10y2y != null && spread10y2y < 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center">
            <DollarSign size={16} className="text-warning" />
          </div>
          Rates & Bonds
        </h1>
        <p className="text-[13px] text-fg-muted mt-1">Treasury yields, yield curve analysis (FRED)</p>
      </div>

      {/* Rates Grid */}
      {data?.rates && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(data.rates).map(([name, value]) => (
            <RateCard key={name} name={name} value={value} />
          ))}
        </div>
      )}

      {/* Yield Curve */}
      <div className={`glass p-6 ${inverted ? 'glow-danger' : 'glow-primary'}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-fg" />
          <h3 className="text-[13px] font-semibold text-fg">Yield Curve (10Y - 2Y)</h3>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-4xl font-bold font-mono ${inverted ? 'text-danger' : 'text-primary'}`}>
            {spread10y2y != null ? `${spread10y2y > 0 ? '+' : ''}${spread10y2y.toFixed(2)}%` : 'N/A'}
          </span>
          <div className="text-right">
            {inverted && (
              <div className="flex items-center gap-1.5 text-danger text-[13px] font-bold">
                <AlertTriangle className="w-4 h-4" /> INVERTED
              </div>
            )}
            <p className="text-[11px] text-fg-muted mt-1 font-mono">
              Curve shape: {data?.curveShape?.replace(/_/g, ' ') || 'unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* 3M-10Y Spread */}
      {data?.spreads?.['3M-10Y'] && (
        <div className="glass p-6">
          <h3 className="text-[13px] font-semibold text-fg mb-3">3M - 10Y Spread (Recession Indicator)</h3>
          <span className={`text-3xl font-bold font-mono ${
            parseFloat(data.spreads['3M-10Y']) < 0 ? 'text-danger' : 'text-primary'
          }`}>
            {parseFloat(data.spreads['3M-10Y']) > 0 ? '+' : ''}{data.spreads['3M-10Y']}%
          </span>
        </div>
      )}
    </div>
  )
}
