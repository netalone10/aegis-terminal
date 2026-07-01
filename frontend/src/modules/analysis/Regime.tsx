import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, TrendingDown, AlertTriangle, Shield } from 'lucide-react'
import { api } from '../../lib/api'

interface MacroData {
  dxy?: number
  dgs10?: number
  dgs2?: number
  dtb3?: number
  dtb6?: number
  yieldCurve?: number
  regime?: string
  [key: string]: any
}

type RegimeType = 'expansion' | 'inflation' | 'deflation' | 'stagflation'

const REGIME_META: Record<RegimeType, { label: string; color: string; badge: string; desc: string }> = {
  expansion: {
    label: 'Expansion',
    color: 'var(--kt-up)',
    badge: 'badge-bull',
    desc: 'Ekonomi tumbuh, risk-on, USD lemah, emas naik, equities kuat',
  },
  inflation: {
    label: 'Inflation',
    color: 'var(--kt-gold)',
    badge: 'badge-gold',
    desc: 'Inflasi tinggi, Fed hawkish, yields naik, emas volatile',
  },
  deflation: {
    label: 'Deflation',
    color: 'var(--kt-info)',
    badge: 'badge-info',
    desc: 'Permintaan turun, Fed dovish, yields turun, safe-haven demand',
  },
  stagflation: {
    label: 'Stagflation',
    color: 'var(--kt-dn)',
    badge: 'badge-bear',
    desc: 'Pertumbuhan lambat + inflasi tinggi, worst scenario, semua turun',
  },
}

const IMPLICATIONS: Record<RegimeType, string> = {
  expansion: 'Risk-on. Buy equities, sell USD, buy AUD/NZD. Gold neutral-bullish.',
  inflation: 'Hedge with commodities. Gold bullish. USD mixed. Bonds bearish.',
  deflation: 'Risk-off. Buy bonds, JPY, CHF. Gold bullish on safe-haven. Equities bearish.',
  stagflation: 'Defensive. Cash, gold, energy stocks. Avoid growth. Short equities.',
}

const PAIR_BIAS: Record<RegimeType, Record<string, string>> = {
  expansion: {
    'XAU/USD': 'Neutral-bullish — growth supports risk, but real rates may cap gold',
    'EUR/USD': 'Bullish — USD weakens on risk-on sentiment',
    'GBP/USD': 'Bullish — risk-on USD selling',
    'USD/JPY': 'Bullish — carry trade demand, JPY weakens',
    'BTC/USD': 'Bullish — risk-on, liquidity flows into crypto',
  },
  inflation: {
    'XAU/USD': 'Bullish — inflation hedge demand, but rising yields compete',
    'EUR/USD': 'Bearish — ECB may lag Fed hawkishness',
    'GBP/USD': 'Mixed — BOE policy response uncertain',
    'USD/JPY': 'Bullish — Fed hawkishness supports USD',
    'BTC/USD': 'Volatile — inflation hedge narrative vs rate sensitivity',
  },
  deflation: {
    'XAU/USD': 'Bullish — safe-haven demand, falling real yields',
    'EUR/USD': 'Mixed — both central banks dovish',
    'GBP/USD': 'Bearish — UK economy sensitive to demand shocks',
    'USD/JPY': 'Bearish — JPY safe-haven bid, USD rate cuts',
    'BTC/USD': 'Bearish — liquidity contraction, risk-off',
  },
  stagflation: {
    'XAU/USD': 'Bullish — gold outperforms in stagflation historically',
    'EUR/USD': 'Bearish — USD safe-haven on worst-case scenario',
    'GBP/USD': 'Bearish — USD strength on risk-off',
    'USD/JPY': 'Bearish — JPY safe-haven demand',
    'BTC/USD': 'Bearish — all risk assets suffer in stagflation',
  },
}

function deriveRegime(d: MacroData): RegimeType {
  const curve = d.yieldCurve ?? ((d.dgs10 ?? 0) - (d.dgs2 ?? 0))
  const y10 = d.dgs10 ?? 0

  if (curve > 0.5 && y10 > 4) return 'expansion'
  if (y10 > 4.5 && curve < 0) return 'stagflation'
  if (y10 < 3 && curve > 0) return 'deflation'
  return 'inflation'
}

function DirectionArrow({ value }: { value?: number }) {
  if (value == null) return <span style={{ color: 'var(--kt-muted)' }}>—</span>
  if (value > 0) return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (value < 0) return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <span style={{ color: 'var(--kt-muted)' }}>—</span>
}

export default function Regime() {
  const { data, isLoading } = useQuery<MacroData>({
    queryKey: ['macro'],
    queryFn: () => api<MacroData>('/api/macro'),
    staleTime: 300_000,
  })

  const curve = data?.yieldCurve ?? ((data?.dgs10 ?? 0) - (data?.dgs2 ?? 0))
  const regime = data ? deriveRegime(data) : 'inflation'
  const meta = REGIME_META[regime]
  const pairs = PAIR_BIAS[regime]

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">MACRO REGIME</div>
          <h1>Regime Analysis</h1>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)' }}>
            Deteksi rezim pasar aktif sebelum masuk posisi
          </p>
        </div>
        <div className="kt-route-actions">
          <span className="kt-status-dot" />
          <span>Auto-refresh 5min</span>
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-body">
              <div className="skeleton w-40 h-8 mb-3" />
              <div className="skeleton w-64 h-4" />
            </div>
          </div>
          <div className="kt-stat-grid kt-stat-grid-4" style={{ marginBottom: 16 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="kt-stat">
                <div className="skeleton w-16 h-3 mb-3" />
                <div className="skeleton w-20 h-7" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Hero Regime Card */}
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Current Regime
                </span>
              </div>
              <span className={meta.badge}>{meta.label}</span>
            </div>
            <div className="kt-panel-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <span style={{
                  fontSize: 'var(--xxl)',
                  fontWeight: 800,
                  color: meta.color,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                }}>
                  {meta.label}
                </span>
              </div>
              <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--md)', marginBottom: 16 }}>
                {meta.desc}
              </p>
              <div className="kt-stat-grid kt-stat-grid-4" style={{ gap: 12 }}>
                <div className="kt-stat">
                  <div className="kt-stat-label">DXY</div>
                  <div className="kt-stat-value">{data?.dxy?.toFixed(2) ?? '—'}</div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">10Y Yield</div>
                  <div className="kt-stat-value">{data?.dgs10?.toFixed(3) ?? '—'}%</div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">2Y Yield</div>
                  <div className="kt-stat-value">{data?.dgs2?.toFixed(3) ?? '—'}%</div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">Spread (10Y-2Y)</div>
                  <div className="kt-stat-value" style={{ color: curve > 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                    {curve.toFixed(3)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Indicators */}
          <div className="kt-stat-grid kt-stat-grid-4" style={{ marginBottom: 16 }}>
            <div className="kt-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DirectionArrow value={data?.dxy} />
                <span className="kt-stat-label" style={{ margin: 0 }}>DXY</span>
              </div>
              <div className="kt-stat-value">{data?.dxy?.toFixed(2) ?? '—'}</div>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Dollar Index</span>
            </div>
            <div className="kt-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DirectionArrow value={data?.dgs10} />
                <span className="kt-stat-label" style={{ margin: 0 }}>10Y</span>
              </div>
              <div className="kt-stat-value">{data?.dgs10?.toFixed(3) ?? '—'}%</div>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>10Y Treasury</span>
            </div>
            <div className="kt-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DirectionArrow value={data?.dgs2} />
                <span className="kt-stat-label" style={{ margin: 0 }}>2Y</span>
              </div>
              <div className="kt-stat-value">{data?.dgs2?.toFixed(3) ?? '—'}%</div>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>2Y Treasury</span>
            </div>
            <div className="kt-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DirectionArrow value={curve} />
                <span className="kt-stat-label" style={{ margin: 0 }}>Spread</span>
              </div>
              <div className="kt-stat-value" style={{ color: curve > 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                {curve.toFixed(3)}%
              </div>
              <span style={{ color: curve > 0 ? 'var(--kt-up)' : 'var(--kt-dn)', fontSize: 'var(--xs)' }}>
                {curve > 0 ? 'Normal' : 'Inverted'}
              </span>
            </div>
          </div>

          {/* Regime Implications */}
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Trading Implications
                </span>
              </div>
              <span className={meta.badge}>{meta.label}</span>
            </div>
            <div className="kt-panel-body">
              <div className="kt-card-pad" style={{ borderLeft: `3px solid ${meta.color}` }}>
                <p style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', lineHeight: 1.6 }}>
                  {IMPLICATIONS[regime]}
                </p>
              </div>
            </div>
          </div>

          {/* Pair-by-Pair Bias */}
          <div className="kt-panel">
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {regime === 'stagflation' || regime === 'deflation'
                  ? <AlertTriangle size={16} style={{ color: 'var(--kt-gold)' }} />
                  : <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
                }
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Pair Bias — {meta.label} Regime
                </span>
              </div>
            </div>
            <div className="kt-panel-body" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--kt-border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Pair</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Bias</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(pairs).map(([pair, bias]) => (
                    <tr key={pair} style={{ borderBottom: '1px solid var(--kt-border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--kt-text)', fontWeight: 700 }}>{pair}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--kt-text2)' }}>{bias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
