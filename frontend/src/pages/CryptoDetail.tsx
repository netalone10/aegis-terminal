import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Bitcoin, TrendingUp, TrendingDown, Minus, Target, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'

/* ── Helpers ── */

function biasIcon(bias: string) {
  if (bias === 'bullish') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function rsiColor(rsi: number): string {
  if (rsi >= 70) return 'var(--kt-dn)'
  if (rsi <= 30) return 'var(--kt-up)'
  return 'var(--kt-muted)'
}

/* ═══════════════════════════════════════════════════════════════════
   CRYPTO DETAIL PAGE
   ═══════════════════════════════════════════════════════════════════ */

interface Signal {
  id: number
  symbol: string
  timeframe: string
  bias: string
  confidence: number
  price: number
  structure: any
  technical: any
  volume: any
  setups: Array<{
    type: string
    entry: number
    sl: number
    tp: number
    rr: number
    reason: string
    confluence: string[]
  }>
  reasoning: string
  created_at: string
}

export function CryptoDetail() {
  const { symbol } = useParams<{ symbol: string }>()

  const { data, isLoading } = useQuery<any>({
    queryKey: ['crypto-signal', symbol],
    queryFn: () => api(`/api/crypto/signals?symbol=${symbol}&limit=1`),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  })

  const signal: Signal | null = data?.signals?.[0] || null

  return (
    <div className="kt-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Bitcoin size={20} style={{ color: 'var(--kt-gold)' }} />
        <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>
          {symbol}
        </h1>
        {signal && (
          <span className={signal.bias === 'bullish' ? 'badge-bull' : signal.bias === 'bearish' ? 'badge-bear' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            {biasIcon(signal.bias)}
            {signal.bias.toUpperCase()} {signal.confidence}%
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
          Loading...
        </div>
      ) : !signal ? (
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
          No active signal for {symbol}. Waiting for setup...
        </div>
      ) : (
        <>
          {/* Price + Bias */}
          <div className="kt-card kt-card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>Price</div>
              <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)', lineHeight: 1 }}>
                ${signal.price.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>Timeframe</div>
              <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                {signal.timeframe}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>RSI</div>
              <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: rsiColor(signal.technical.rsi.value) }}>
                {signal.technical.rsi.value.toFixed(0)} <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>({signal.technical.rsi.zone})</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>MACD</div>
              <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: signal.technical.macd.signal === 'bullish' ? 'var(--kt-up)' : signal.technical.macd.signal === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>
                {signal.technical.macd.signal.toUpperCase()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>ATR</div>
              <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                {signal.technical.atr.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>Volume</div>
              <div style={{ fontSize: 'var(--lg)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: signal.volume.volumeSpike ? 'var(--kt-gold)' : 'var(--kt-muted)' }}>
                {signal.volume.obvTrend} {signal.volume.volumeSpike && '⚡'}
              </div>
            </div>
          </div>

          {/* Setups */}
          {signal.setups.length > 0 && (
            <div className="kt-card kt-card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Target size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Setups</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {signal.setups.map((setup, i) => (
                  <div key={i} style={{ padding: 12, background: 'var(--kt-bg)', borderRadius: 8, border: '1px solid var(--kt-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span className={setup.type === 'long' ? 'badge-bull' : 'badge-bear'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {setup.type.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>R:R {setup.rr}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                      <div>
                        <span style={{ color: 'var(--kt-muted)' }}>Entry: </span>
                        <span style={{ color: 'var(--kt-text)', fontWeight: 600 }}>${setup.entry.toFixed(2)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--kt-muted)' }}>SL: </span>
                        <span style={{ color: 'var(--kt-dn)' }}>${setup.sl.toFixed(2)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--kt-muted)' }}>TP: </span>
                        <span style={{ color: 'var(--kt-up)' }}>${setup.tp.toFixed(2)}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 'var(--xs)', color: 'var(--kt-dim)' }}>
                      {setup.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning */}
          <div className="kt-card kt-card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} style={{ color: 'var(--kt-gold)' }} />
              <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Reasoning</span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--sm)', color: 'var(--kt-dim)', lineHeight: 1.6 }}>
              {signal.reasoning}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
