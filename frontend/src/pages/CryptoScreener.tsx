import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bitcoin, Zap } from 'lucide-react'
import { api } from '../lib/api'

/* ═══════════════════════════════════════════════════════════════════
   CRYPTO SCREENER PAGE
   ═══════════════════════════════════════════════════════════════════ */

interface Coin {
  symbol: string
  rank: number
  volume_24h: number
}

export function CryptoScreener() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['crypto-screening'],
    queryFn: () => api('/api/crypto/screening'),
    staleTime: 60_000,
    retry: false,
  })

  const coins: Coin[] = data?.symbols || []

  return (
    <div className="kt-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Bitcoin size={20} style={{ color: 'var(--kt-gold)' }} />
        <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>
          Crypto Screener
        </h1>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--xs)', color: 'var(--kt-dim)', fontFamily: 'var(--font-mono)' }}>
          {coins.length} coins
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
          Loading...
        </div>
      ) : coins.length === 0 ? (
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
          No data available
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {coins.map(coin => (
            <Link
              key={coin.symbol}
              to={`/crypto/${coin.symbol}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                    {coin.symbol.replace('USDT', '')}
                  </span>
                  <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)', fontFamily: 'var(--font-mono)' }}>
                    #{coin.rank}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={12} style={{ color: 'var(--kt-gold)' }} />
                  <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                    Vol: ${(coin.volume_24h / 1e9).toFixed(2)}B
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
