import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { api } from '../../lib/api'
import DataBadge from '../../components/DataBadge'

const PAIRS = [
  { symbol: 'XAU/USD', name: 'Gold' },
  { symbol: 'EUR/USD', name: 'Euro' },
  { symbol: 'GBP/USD', name: 'Pound' },
  { symbol: 'USD/JPY', name: 'Yen' },
  { symbol: 'USD/IDR', name: 'Rupiah' },
  { symbol: 'AUD/USD', name: 'Aussie' },
  { symbol: 'USD/CHF', name: 'Franc' },
  { symbol: 'NZD/USD', name: 'Kiwi' },
]

export default function Market() {
  const { data: forexData, isLoading } = useQuery<any>({
    queryKey: ['forex-live'],
    queryFn: () => api('/api/forex/live'),
    staleTime: 300_000,
    refetchInterval: 60_000,
    retry: false,
  })

  const pairs = (forexData?.pairs ?? []) as any[]

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Market Live</div>
          <h1>Ringkasan Market</h1>
          <p>Major forex pairs with live pricing</p>
        </div>
        <div className="kt-route-actions">
          <DataBadge source="Yahoo Finance" />
        </div>
      </div>

      {isLoading ? (
        <div className="kt-grid-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="kt-market-card">
              <div className="skeleton w-16 h-3 mb-3" />
              <div className="skeleton w-28 h-7 mb-3" />
              <div className="skeleton w-full h-4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="kt-grid-4">
          {PAIRS.map(pair => {
            const live = pairs.find((p: any) => p.symbol === pair.symbol)
            const price = live?.price ?? 0
            const change = live?.changePct ?? 0
            const rsi = live?.rsi
            const ema20 = live?.ema20
            const ema50 = live?.ema50
            const isUp = change >= 0
            const trend = ema20 && ema50 ? (ema20 > ema50 ? 'bullish' : 'bearish') : (isUp ? 'bullish' : 'bearish')

            const formatPrice = (v: number) => {
              if (pair.symbol.includes('JPY') || pair.symbol.includes('IDR')) return v.toFixed(2)
              if (pair.symbol.includes('XAU')) return v.toFixed(2)
              return v.toFixed(4)
            }

            return (
              <div key={pair.symbol} className="kt-market-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div className="kt-stat-label" style={{ marginBottom: 2 }}>{pair.symbol}</div>
                    <div style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>{pair.name}</div>
                  </div>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isUp ? 'var(--kt-upf)' : 'var(--kt-dnf)',
                  }}>
                    {isUp
                      ? <TrendingUp size={13} style={{ color: 'var(--kt-up)' }} />
                      : <TrendingDown size={13} style={{ color: 'var(--kt-dn)' }} />}
                  </div>
                </div>
                <div className="kt-stat-value" style={{ marginTop: 10 }}>
                  {formatPrice(price)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{
                    color: isUp ? 'var(--kt-up)' : 'var(--kt-dn)',
                    fontSize: 'var(--sm)', fontWeight: 600, fontFamily: 'var(--font-mono)',
                  }}>
                    {isUp ? '+' : ''}{change.toFixed(2)}%
                  </span>
                  {rsi != null && (
                    <span style={{
                      color: rsi > 60 ? 'var(--kt-up)' : rsi < 40 ? 'var(--kt-dn)' : 'var(--kt-muted)',
                      fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)',
                    }}>
                      RSI {rsi.toFixed(0)}
                    </span>
                  )}
                  <span style={{
                    color: trend === 'bullish' ? 'var(--kt-up)' : 'var(--kt-dn)',
                    fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', marginLeft: 'auto',
                  }}>
                    {trend === 'bullish' ? '▲' : '▼'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
