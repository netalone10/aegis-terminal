import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import {
  Activity, TrendingUp, TrendingDown, Minus,
  Wifi, WifiOff, Globe, BarChart3, Gauge,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── Helpers ── */

function biasColor(bias: string): string {
  if (bias === 'bullish' || bias === 'BULLISH') return 'var(--kt-up)'
  if (bias === 'bearish' || bias === 'BEARISH') return 'var(--kt-dn)'
  return 'var(--kt-muted)'
}

function biasIcon(bias: string) {
  if (bias === 'bullish' || bias === 'BULLISH') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish' || bias === 'BEARISH') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function rsiColor(rsi: number): string {
  if (rsi >= 70) return 'var(--kt-dn)'
  if (rsi <= 30) return 'var(--kt-up)'
  return 'var(--kt-muted)'
}

/* ═══════════════════════════════════════════════════════════════════
   MARKET PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function Market() {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  /* ── Queries ── */
  const { data: price } = useQuery<any>({
    queryKey: ['mt5-price', 'XAUUSD.vxc'],
    queryFn: () => api('/api/mt5/price?symbol=XAUUSD.vxc'),
    refetchInterval: 5_000,
    retry: 2,
  })

  const { data: smcData } = useQuery<any>({
    queryKey: ['smc-batch'],
    queryFn: () => api('/api/smc/batch'),
    staleTime: 300_000,
    refetchInterval: 120_000,
    retry: false,
  })

  const { data: macro } = useQuery<any>({
    queryKey: ['macro'],
    queryFn: () => api('/api/macro'),
    staleTime: 300_000,
    retry: false,
  })

  /* ── Derived ── */
  const pairs = Array.isArray(smcData) ? smcData : (smcData?.data ?? [])
  const watchlist = pairs.filter((p: any) => p.symbol !== 'XAU/USD')
  const xau = pairs.find((p: any) => p.symbol === 'XAU/USD')

  const conn = !!price

  const sentiment = macro?.regime?.toLowerCase() === 'expansion' ? 'Risk-On'
    : macro?.regime?.toLowerCase() === 'deflation' || macro?.regime?.toLowerCase() === 'stagflation' ? 'Risk-Off'
    : 'Mixed'

  const sentimentColor = sentiment === 'Risk-On' ? 'var(--kt-up)' : sentiment === 'Risk-Off' ? 'var(--kt-dn)' : 'var(--kt-gold)'
  const sentimentBg = sentiment === 'Risk-On' ? 'rgba(34,197,94,.15)' : sentiment === 'Risk-Off' ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.12)'

  useEffect(() => {
    if (price) setLastUpdate(new Date())
  }, [price])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe size={20} style={{ color: 'var(--kt-gold)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--xl)', fontWeight: 700, color: 'var(--kt-text)' }}>Market Overview</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdate && (
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-dim)', fontFamily: 'var(--font-mono)' }}>
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          {conn ? (
            <span className="badge-bull" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Wifi size={10} /> Live
            </span>
          ) : (
            <span className="badge-bear" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <WifiOff size={10} /> Offline
            </span>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          TOP: XAU/USD Hero Card
          ═══════════════════════════════════════════════════ */}
      <div className="kt-card" style={{
        padding: 20,
        background: 'rgba(245,158,11,.04)',
        border: '1px solid rgba(245,158,11,.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Activity size={18} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontWeight: 700, fontSize: 'var(--md)', color: 'var(--kt-gold)' }}>XAU / USD</span>
          {xau && (
            <span style={{
              marginLeft: 8, padding: '2px 8px', borderRadius: 4,
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: biasColor(xau.bias) === 'var(--kt-up)' ? 'rgba(34,197,94,.15)' : biasColor(xau.bias) === 'var(--kt-dn)' ? 'rgba(239,68,68,.15)' : 'rgba(148,163,184,.08)',
              color: biasColor(xau.bias),
            }}>
              {xau.bias?.toUpperCase()} {xau.confidence}%
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
          {/* Bid */}
          <div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>BID</div>
            <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)', lineHeight: 1 }}>
              {price?.bid?.toFixed(2) ?? '—'}
            </div>
          </div>
          {/* Ask */}
          <div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>ASK</div>
            <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)', lineHeight: 1 }}>
              {price?.ask?.toFixed(2) ?? '—'}
            </div>
          </div>
          {/* Spread */}
          <div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>SPREAD</div>
            <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-gold)', lineHeight: 1 }}>
              {price?.spread ?? '—'}
              <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 400, marginLeft: 4 }}>pts</span>
            </div>
          </div>
          {/* ATR + RSI from xau meta */}
          <div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>RSI / ATR</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: xau?.meta?.rsi ? rsiColor(xau.meta.rsi) : 'var(--kt-muted)' }}>
                {xau?.meta?.rsi?.toFixed(0) ?? '—'}
              </span>
              <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
                {xau?.meta?.atr?.toFixed(2) ?? '—'}
              </span>
            </div>
          </div>
          {/* Premium / Discount */}
          <div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>ZONE</div>
            <div style={{
              display: 'inline-block', padding: '4px 10px', borderRadius: 4,
              fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: xau?.premiumDiscount === 'premium' ? 'rgba(239,68,68,.12)' : xau?.premiumDiscount === 'discount' ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.08)',
              color: xau?.premiumDiscount === 'premium' ? 'var(--kt-dn)' : xau?.premiumDiscount === 'discount' ? 'var(--kt-up)' : 'var(--kt-muted)',
            }}>
              {xau?.premiumDiscount?.toUpperCase?.() ?? '—'}
            </div>
          </div>
          {/* EMAs */}
          <div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginBottom: 4 }}>EMA 20 / 50</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                {xau?.meta?.ema20?.toFixed(2) ?? '—'}
              </span>
              <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-dim)' }}>
                {xau?.meta?.ema50?.toFixed(2) ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          MIDDLE: Watchlist Grid
          ═══════════════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Watchlist</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {watchlist.length === 0 && (
            <div className="kt-card kt-card-pad" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Loading watchlist…</span>
            </div>
          )}
          {watchlist.map((pair: any) => (
            <div key={pair.symbol} className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Row 1: Symbol + Bias */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>{pair.symbol}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {biasIcon(pair.bias)}
                  <span style={{ fontWeight: 700, fontSize: 'var(--sm)', color: biasColor(pair.bias), fontFamily: 'var(--font-mono)' }}>
                    {pair.bias?.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Row 2: Confidence bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase' }}>Confidence</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: biasColor(pair.bias), fontFamily: 'var(--font-mono)' }}>{pair.confidence}%</span>
                </div>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden' }}>
                  <div style={{ width: `${pair.confidence}%`, height: '100%', borderRadius: 2, background: biasColor(pair.bias), transition: 'width .4s' }} />
                </div>
              </div>

              {/* Row 3: RSI + EMAs */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {pair.meta?.rsi != null && (
                  <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: rsiColor(pair.meta.rsi) }}>
                    RSI {pair.meta.rsi.toFixed(0)}
                  </span>
                )}
                {pair.meta?.ema20 != null && (
                  <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
                    EMA20 {pair.meta.ema20.toFixed(2)}
                  </span>
                )}
                {pair.meta?.ema50 != null && (
                  <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: 'var(--kt-dim)' }}>
                    EMA50 {pair.meta.ema50.toFixed(2)}
                  </span>
                )}
                {pair.meta?.sma200 != null && (
                  <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: 'var(--kt-dim)' }}>
                    SMA200 {pair.meta.sma200.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Row 4: Premium/Discount tag */}
              <div>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  background: pair.premiumDiscount === 'premium' ? 'rgba(239,68,68,.12)' : pair.premiumDiscount === 'discount' ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.08)',
                  color: pair.premiumDiscount === 'premium' ? 'var(--kt-dn)' : pair.premiumDiscount === 'discount' ? 'var(--kt-up)' : 'var(--kt-muted)',
                }}>
                  {pair.premiumDiscount?.toUpperCase?.() ?? '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          BOTTOM: Macro Quick View
          ═══════════════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Gauge size={16} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Macro Quick View</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {/* DXY */}
          <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>DXY</span>
            <span style={{ fontSize: 'var(--md)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
              {macro?.dxy?.toFixed(2) ?? '—'}
            </span>
          </div>

          {/* 10Y Yield */}
          <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>10Y Yield</span>
            <span style={{ fontSize: 'var(--md)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
              {macro?.dgs10 != null ? `${macro.dgs10.toFixed(3)}%` : '—'}
            </span>
          </div>

          {/* Regime */}
          <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Regime</span>
            <span style={{ fontSize: 'var(--md)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
              {macro?.regime ?? '—'}
            </span>
          </div>

          {/* Sentiment */}
          <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Sentiment</span>
            <span style={{
              display: 'inline-block', padding: '4px 10px', borderRadius: 4,
              fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: sentimentBg, color: sentimentColor, alignSelf: 'flex-start',
            }}>
              {sentiment}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
