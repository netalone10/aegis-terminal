import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { api } from '../lib/api'

/* ── Helpers ── */

function biasColor(bias: string): string {
  if (bias === 'bullish') return 'var(--kt-up)'
  if (bias === 'bearish') return 'var(--kt-dn)'
  return 'var(--kt-muted)'
}

function biasIcon(bias: string) {
  if (bias === 'bullish') return <TrendingUp size={10} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={10} style={{ color: 'var(--kt-dn)' }} />
  return null
}

/* ═══════════════════════════════════════════════════════════════════
   CRYPTO SIGNALS PAGE
   ═══════════════════════════════════════════════════════════════════ */

interface Signal {
  id: number
  symbol: string
  timeframe: string
  bias: string
  confidence: number
  price: number
  setups: Array<{
    type: string
    entry: number
    sl: number
    tp: number
    rr: number
  }>
  created_at: string
}

export function CryptoSignals() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['crypto-signals'],
    queryFn: () => api('/api/crypto/signals?limit=50'),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  })

  const signals: Signal[] = data?.signals || []

  return (
    <div className="kt-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={20} style={{ color: 'var(--kt-gold)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>
            Crypto Signals
          </h1>
        </div>
        <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)', background: 'rgba(245,158,11,.12)', color: 'var(--kt-gold)' }}>
          {signals.length} Active
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
          Loading...
        </div>
      ) : signals.length === 0 ? (
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
          No active signals yet. Waiting for candle close...
        </div>
      ) : (
        <div className="kt-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>TF</th>
                  <th>Bias</th>
                  <th>Conf</th>
                  <th>Entry</th>
                  <th>SL</th>
                  <th>TP</th>
                  <th>R:R</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(signal => (
                  <tr key={signal.id}>
                    <td>
                      <Link to={`/crypto/${signal.symbol}`} style={{ color: 'var(--kt-gold)', fontWeight: 600, textDecoration: 'none' }}>
                        {signal.symbol}
                      </Link>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{signal.timeframe}</td>
                    <td>
                      <span className={signal.bias === 'bullish' ? 'badge-bull' : signal.bias === 'bearish' ? 'badge-bear' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {biasIcon(signal.bias)}
                        {signal.bias.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: biasColor(signal.bias) }}>
                      {signal.confidence}%
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      ${signal.setups[0]?.entry.toFixed(2) || '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>
                      ${signal.setups[0]?.sl.toFixed(2) || '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                      ${signal.setups[0]?.tp.toFixed(2) || '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {signal.setups[0]?.rr || '—'}
                    </td>
                    <td style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>
                      {new Date(signal.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
