import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../lib/api'
import DataBadge from '../../components/DataBadge'

interface TFData {
  timeframe: string
  bias: string
  trend: string
  ob: any[]
  fvg: any[]
  liquidity: any[]
  score: number
}

interface PairData {
  pair: string
  timeframes: Record<string, TFData>
  confluence: {
    score: number
    alignment: 'strong' | 'partial' | 'conflict'
    bias: string
  }
}

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'bullish') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function PairCard({ pair }: { pair: PairData }) {
  const [expanded, setExpanded] = useState(false)
  const c = pair.confluence
  const _color = c.bias === 'bullish' ? 'var(--kt-up)' : c.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-gold)'
  const alignStyle = {
    strong: { bg: 'var(--kt-upf)', color: 'var(--kt-up)', label: 'KUAT' },
    partial: { bg: 'var(--kt-goldf)', color: 'var(--kt-gold)', label: 'SEBAGIAN' },
    conflict: { bg: 'var(--kt-dnf)', color: 'var(--kt-dn)', label: 'KONFLIK' },
  }[c.alignment]

  return (
    <div className="kt-card" style={{ marginBottom: 8 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-mono)' }}>{pair.pair}</span>
          <BiasIcon bias={c.bias} />
          <span style={{
            fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700,
            padding: '3px 8px', borderRadius: 999,
            background: alignStyle.bg, color: alignStyle.color,
          }}>{alignStyle.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: _color }}>{c.score}%</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--kt-border-soft)', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(pair.timeframes).map(([tf, data]) => (
              <div key={tf} style={{
                background: 'var(--kt-bg)', borderRadius: 8, padding: 12,
                border: '1px solid var(--kt-border-soft)',
              }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--kt-muted)', marginBottom: 8 }}>{tf}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <BiasIcon bias={data.bias} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: data.bias === 'bullish' ? 'var(--kt-up)' : data.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>
                    {data.bias?.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--kt-muted)' }}>
                  Trend: {data.trend} · Score: {data.score}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Confluence() {
  const { data, isLoading, error } = useQuery<PairData[]>({
    queryKey: ['smc-confluence'],
    queryFn: () => api('/api/smc/confluence'),
    refetchInterval: 120_000,
  })

  const strong = data?.filter(p => p.confluence.alignment === 'strong').length ?? 0
  const partial = data?.filter(p => p.confluence.alignment === 'partial').length ?? 0
  const conflict = data?.filter(p => p.confluence.alignment === 'conflict').length ?? 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="kt-kicker">Konfluens Multi-TF</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1 }}>Konfluens Multi-Timeframe</h1>
          <p style={{ color: 'var(--kt-muted)', marginTop: 6, fontSize: 12 }}>Alignment SMC lintas 3 timeframe: Daily, 4H, 1H</p>
        </div>
        <DataBadge source="SMC Engine" />
      </div>

      <div className="kt-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="kt-stat" style={{ textAlign: 'center', padding: 12 }}>
          <p className="kt-kicker" style={{ marginBottom: 4 }}>KUAT</p>
          <p style={{ fontSize: 'var(--md)', fontWeight: 800, color: 'var(--kt-up)', fontFamily: 'var(--font-mono)' }}>{strong}</p>
        </div>
        <div className="kt-stat" style={{ textAlign: 'center', padding: 12 }}>
          <p className="kt-kicker" style={{ marginBottom: 4 }}>SEBAGIAN</p>
          <p style={{ fontSize: 'var(--md)', fontWeight: 800, color: 'var(--kt-gold)', fontFamily: 'var(--font-mono)' }}>{partial}</p>
        </div>
        <div className="kt-stat" style={{ textAlign: 'center', padding: 12 }}>
          <p className="kt-kicker" style={{ marginBottom: 4 }}>KONFLIK</p>
          <p style={{ fontSize: 'var(--md)', fontWeight: 800, color: 'var(--kt-dn)', fontFamily: 'var(--font-mono)' }}>{conflict}</p>
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--kt-muted)', textAlign: 'center', padding: 40 }}>Memuat data multi-timeframe...</p>}
      {error && <p style={{ color: 'var(--kt-dn)', textAlign: 'center', padding: 40 }}>Gagal memuat data konfluens</p>}

      {data && data.map(pair => <PairCard key={pair.pair} pair={pair} />)}
    </div>
  )
}
