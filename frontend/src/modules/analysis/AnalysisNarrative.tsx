import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TrendingUp, TrendingDown, Target, Layers, Search, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'

interface NarrativeData {
  symbol: string
  timeframe: string
  date: string
  meta?: { price?: number; atr?: number; rsi?: number; ema20?: number; ema50?: number; sma200?: number }
  marketStructure: { summary: string; bullets: string[] }
  liquidityBehaviour: {
    summary: string
    bullets: string[]
    importantZones: { level: string; label: string }[]
    keyRead: string[]
  }
  scenarios: {
    primary: { probability: number; description: string; targets: string[] }
    alternative: { probability: number; description: string; targets: string[] }
  }
}

export default function AnalysisNarrative() {
  const [symbol, setSymbol] = useState('XAUUSD')
  const [tf, setTf] = useState('4h')

  const { data, isLoading, refetch, isFetching } = useQuery<NarrativeData>({
    queryKey: ['narrative', symbol, tf],
    queryFn: () => api<NarrativeData>(`/api/analysis/narrative?symbol=${symbol}&tf=${tf}`),
    staleTime: 180_000,
    enabled: !!symbol,
  })

  const biasLabel = data ? (data.scenarios.primary.probability > 55 ? 'bullish' : data.scenarios.primary.probability < 45 ? 'bearish' : 'neutral') : 'neutral'

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Narrative Analysis</div>
          <h1>Market Narrative</h1>
          <p>SMC/ICT analysis — real-time data, concise format</p>
        </div>
      </div>

      {/* Controls */}
      <div className="kt-card" style={{ marginBottom: 16 }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '0 0 200px' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--kt-dim)' }} />
            <input
              className="kt-input"
              style={{ width: '100%', paddingLeft: 32 }}
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol..."
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['1h', '4h', '1D'].map(t => (
              <button
                key={t}
                className={`kt-tag ${tf === t ? 'gold' : ''}`}
                onClick={() => setTf(t)}
                style={{ cursor: 'pointer', minWidth: 36, justifyContent: 'center' }}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            className="kt-tag"
            onClick={() => refetch()}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="kt-panel">
          <div className="kt-panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton" style={{ height: 24, width: '60%' }} />
              <div className="skeleton" style={{ height: 16, width: '100%' }} />
              <div className="skeleton" style={{ height: 16, width: '90%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Narrative Card */}
      {data && (
        <div className="kt-panel">
          <div className="kt-panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Target size={16} style={{ color: 'var(--kt-gold)' }} />
              <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{data.symbol}</span>
              <span className="kt-tag gold">{data.timeframe}</span>
              <span className={`badge-${biasLabel === 'bullish' ? 'bull' : biasLabel === 'bearish' ? 'bear' : 'neutral'}`}>
                {data.marketStructure.summary}
              </span>
            </div>
            <span style={{ color: 'var(--kt-dim)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
              {new Date(data.date).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC
            </span>
          </div>
          <div className="kt-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* 1. Structure — compact bullets */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--kt-goldf)', color: 'var(--kt-gold)',
                  fontSize: 'var(--xs)', fontWeight: 800,
                }}>1</span>
                <h3 style={{ fontSize: 'var(--md)', fontWeight: 700, color: 'var(--kt-text)', letterSpacing: '-0.2px' }}>
                  Structure
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {data.marketStructure.bullets.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 'var(--sm)', color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--kt-gold)', flexShrink: 0, fontSize: 'var(--xs)' }}>▸</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </section>

            <div style={{ height: 1, background: 'var(--kt-border)' }} />

            {/* 2. Levels — data table */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--kt-bluef)', color: 'var(--kt-blue)',
                  fontSize: 'var(--xs)', fontWeight: 800,
                }}>2</span>
                <h3 style={{ fontSize: 'var(--md)', fontWeight: 700, color: 'var(--kt-text)' }}>
                  Levels
                </h3>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginLeft: 4 }}>
                  {data.liquidityBehaviour.summary}
                </span>
              </div>

              {/* Level bullets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12 }}>
                {data.liquidityBehaviour.bullets.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 'var(--sm)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--kt-blue)', flexShrink: 0, fontSize: 'var(--xs)' }}>▸</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>

              {/* Important Zones — compact grid */}
              {data.liquidityBehaviour.importantZones.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.liquidityBehaviour.importantZones.map((z, i) => (
                      <div key={i} className="kt-level-row" style={{ marginBottom: 0 }}>
                        <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)' }}>{z.label}</span>
                        <span className="mono" style={{ fontSize: 'var(--xs)', fontWeight: 700, color: 'var(--kt-gold)' }}>{z.level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Reads — one-liners */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {data.liquidityBehaviour.keyRead.map((k, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 'var(--sm)', color: 'var(--kt-text2)' }}>
                    <span style={{ color: 'var(--kt-up)', flexShrink: 0 }}>▸</span>
                    <span>{k}</span>
                  </div>
                ))}
              </div>
            </section>

            <div style={{ height: 1, background: 'var(--kt-border)' }} />

            {/* 3. Scenarios — compact */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--kt-upf)', color: 'var(--kt-up)',
                  fontSize: 'var(--xs)', fontWeight: 800,
                }}>3</span>
                <h3 style={{ fontSize: 'var(--md)', fontWeight: 700, color: 'var(--kt-text)' }}>
                  Scenarios
                </h3>
              </div>

              <div className="kt-grid-2">
                {/* Primary */}
                <div className="kt-card" style={{ borderColor: 'rgba(70,201,127,0.2)' }}>
                  <div className="kt-card-pad">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="badge-bull" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingUp size={10} /> Primary
                      </span>
                      <span className="mono" style={{ fontSize: 'var(--lg)', fontWeight: 700, color: 'var(--kt-up)' }}>
                        {data.scenarios.primary.probability}%
                      </span>
                    </div>
                    <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)', lineHeight: 1.5, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                      {data.scenarios.primary.description}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {data.scenarios.primary.targets.map((t, i) => (
                        <span key={i} className="mono" style={{ fontSize: 'var(--xs)', color: 'var(--kt-up)' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Alternative */}
                <div className="kt-card" style={{ borderColor: 'rgba(255,77,79,0.15)' }}>
                  <div className="kt-card-pad">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="badge-bear" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingDown size={10} /> Alternative
                      </span>
                      <span className="mono" style={{ fontSize: 'var(--lg)', fontWeight: 700, color: 'var(--kt-dn)' }}>
                        {data.scenarios.alternative.probability}%
                      </span>
                    </div>
                    <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)', lineHeight: 1.5, marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                      {data.scenarios.alternative.description}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {data.scenarios.alternative.targets.map((t, i) => (
                        <span key={i} className="mono" style={{ fontSize: 'var(--xs)', color: 'var(--kt-dn)' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !data && (
        <div className="kt-panel">
          <div className="kt-empty">
            <Layers size={32} />
            <p>No narrative data for {symbol} ({tf}).</p>
          </div>
        </div>
      )}
    </div>
  )
}
