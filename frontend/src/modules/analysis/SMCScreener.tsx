import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import {
  ScanLine, TrendingUp, TrendingDown, Minus,
  Target, Shield, Clock, RefreshCw, Filter,
  ArrowUpDown, ChevronDown, Zap,
  Crosshair, BarChart3,
} from 'lucide-react'

/* ── Types ── */

interface BatchEntry {
  symbol: string
  bias: string
  confidence: number
  premiumDiscount: string
  killZone: string
  levels: LevelEntry[]
  signals: string[]
  meta?: {
    rsi?: number
    price?: number
    multiTF?: string
    rr?: number
  }
}

interface LevelEntry {
  type: string
  price: number
  label?: string
}

interface ConfluenceScore {
  biasStrength: number
  zoneAlignment: number
  killZone: number
  rsi: number
  multiTF: number
  rr: number
  total: number
}

interface EnrichedEntry {
  raw: BatchEntry
  score: ConfluenceScore
  rr: number
}

/* ── Confluence scoring ── */

function computeConfluence(entry: BatchEntry): ConfluenceScore {
  // Bias strength (0-25): from confidence
  const biasStrength = Math.round((entry.confidence / 100) * 25)

  // Zone alignment (0-20): premium/discount alignment with bias
  let zoneAlignment = 10 // default mid
  if (
    (entry.bias === 'bullish' && entry.premiumDiscount === 'discount') ||
    (entry.bias === 'bearish' && entry.premiumDiscount === 'premium')
  ) {
    zoneAlignment = 20
  } else if (
    entry.bias === 'bullish' && entry.premiumDiscount === 'premium' ||
    entry.bias === 'bearish' && entry.premiumDiscount === 'discount'
  ) {
    zoneAlignment = 5
  } else if (entry.premiumDiscount === 'equilibrium') {
    zoneAlignment = 12
  }

  // Kill zone (0-10): active kill zone adds points
  const killZone = entry.killZone && entry.killZone !== 'none' ? 10 : 0

  // RSI (0-15): favor RSI aligned with bias
  let rsi = 7
  const rsiVal = entry.meta?.rsi
  if (rsiVal !== undefined) {
    if (entry.bias === 'bullish' && rsiVal < 40) rsi = 15
    else if (entry.bias === 'bullish' && rsiVal < 55) rsi = 12
    else if (entry.bias === 'bullish' && rsiVal > 70) rsi = 4
    else if (entry.bias === 'bearish' && rsiVal > 60) rsi = 15
    else if (entry.bias === 'bearish' && rsiVal > 45) rsi = 12
    else if (entry.bias === 'bearish' && rsiVal < 30) rsi = 4
    else rsi = 8
  }

  // Multi-TF alignment (0-20)
  let multiTF = 10
  if (entry.meta?.multiTF === 'strong') multiTF = 20
  else if (entry.meta?.multiTF === 'partial') multiTF = 12
  else if (entry.meta?.multiTF === 'conflict') multiTF = 4

  // R:R (0-10)
  const rr = entry.meta?.rr ?? 1.5
  let rrScore = 5
  if (rr >= 3) rrScore = 10
  else if (rr >= 2) rrScore = 8
  else if (rr >= 1.5) rrScore = 6
  else if (rr >= 1) rrScore = 4
  else rrScore = 2

  const total = biasStrength + zoneAlignment + killZone + rsi + multiTF + rrScore

  return {
    biasStrength: Math.min(biasStrength, 25),
    zoneAlignment: Math.min(zoneAlignment, 20),
    killZone: Math.min(killZone, 10),
    rsi: Math.min(rsi, 15),
    multiTF: Math.min(multiTF, 20),
    rr: Math.min(rrScore, 10),
    total: Math.min(total, 100),
  }
}

/* ── Helpers ── */

function scoreColor(score: number): string {
  if (score >= 60) return 'var(--kt-up)'
  if (score >= 30) return 'var(--kt-gold)'
  return 'var(--kt-dn)'
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'STRONG'
  if (score >= 60) return 'GOOD'
  if (score >= 40) return 'MODERATE'
  if (score >= 25) return 'WEAK'
  return 'NO SETUP'
}

function BiasBadge({ bias }: { bias: string }) {
  if (bias === 'bullish')
    return <span className="badge-bull" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TrendingUp size={12} /> BUY</span>
  if (bias === 'bearish')
    return <span className="badge-bear" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TrendingDown size={12} /> SELL</span>
  return <span className="badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Minus size={12} /> FLAT</span>
}

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100)
  const color = scoreColor(score)
  return (
    <div className="kt-bar-track" style={{ height: 6, background: 'var(--kt-bg3)', borderRadius: 999, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 999,
          transition: 'width 0.6s var(--kt-ease)',
          boxShadow: `0 0 8px ${color}44`,
        }}
      />
    </div>
  )
}

function ScoreBreakdown({ score }: { score: ConfluenceScore }) {
  const items = [
    { label: 'Bias', value: score.biasStrength, max: 25 },
    { label: 'Zone', value: score.zoneAlignment, max: 20 },
    { label: 'KillZ', value: score.killZone, max: 10 },
    { label: 'RSI', value: score.rsi, max: 15 },
    { label: 'Multi', value: score.multiTF, max: 20 },
    { label: 'R:R', value: score.rr, max: 10 },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {items.map((item) => (
        <div key={item.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--kt-muted)', marginBottom: 2 }}>{item.label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: scoreColor((item.value / item.max) * 100) }}>
            {item.value}/{item.max}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Pair Card ── */

function PairCard({ entry }: { entry: EnrichedEntry }) {
  const [expanded, setExpanded] = useState(false)
  const { raw, score, rr } = entry
  const color = scoreColor(score.total)

  return (
    <div
      className="kt-card"
      style={{
        transition: 'all 0.2s var(--kt-fast)',
        borderColor: expanded ? color : undefined,
      }}
    >
      {/* Card Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '14px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            fontSize: 15,
            color: 'var(--kt-text)',
            letterSpacing: '.5px',
          }}>
            {raw.symbol}
          </span>
          <BiasBadge bias={raw.bias} />
          {raw.killZone && raw.killZone !== 'none' && (
            <span style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              color: 'var(--kt-gold)',
              background: 'var(--kt-goldf)',
              padding: '2px 6px',
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}>
              <Clock size={9} />
              {raw.killZone.replace('_', ' ').toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Score */}
          <div style={{ textAlign: 'right', minWidth: 52 }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color, lineHeight: 1 }}>
              {score.total}
            </div>
            <div style={{ fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--kt-muted)' }}>
              {scoreLabel(score.total)}
            </div>
          </div>
          <ChevronDown
            size={14}
            style={{
              color: 'var(--kt-muted)',
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            }}
          />
        </div>
      </div>

      {/* Score Bar */}
      <div style={{ padding: '0 16px 12px' }}>
        <ScoreBar score={score.total} />
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--kt-border-soft)',
          padding: 16,
          background: 'rgba(0,0,0,.2)',
        }}>
          {/* Price + Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}>
            <div className="kt-stat" style={{ borderRadius: 8, padding: '10px 12px' }}>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>Price</div>
              <div className="kt-stat-value" style={{ fontSize: 14 }}>
                {raw.meta?.price?.toFixed(raw.symbol === 'XAUUSD' ? 2 : 4) ?? '—'}
              </div>
            </div>
            <div className="kt-stat" style={{ borderRadius: 8, padding: '10px 12px' }}>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>RSI</div>
              <div className="kt-stat-value" style={{
                fontSize: 14,
                color: (raw.meta?.rsi ?? 50) > 70 ? 'var(--kt-dn)' : (raw.meta?.rsi ?? 50) < 30 ? 'var(--kt-up)' : 'var(--kt-text)',
              }}>
                {raw.meta?.rsi?.toFixed(0) ?? '—'}
              </div>
            </div>
            <div className="kt-stat" style={{ borderRadius: 8, padding: '10px 12px' }}>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>R:R</div>
              <div className="kt-stat-value mono" style={{
                fontSize: 14,
                color: rr >= 2 ? 'var(--kt-up)' : rr >= 1.5 ? 'var(--kt-text)' : 'var(--kt-dn)',
              }}>
                {rr.toFixed(1)}x
              </div>
            </div>
            <div className="kt-stat" style={{ borderRadius: 8, padding: '10px 12px' }}>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>Zone</div>
              <div className="kt-stat-value" style={{
                fontSize: 12,
                color: raw.premiumDiscount === 'discount' ? 'var(--kt-up)' : raw.premiumDiscount === 'premium' ? 'var(--kt-dn)' : 'var(--kt-gold)',
              }}>
                {raw.premiumDiscount.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Key Levels */}
          {raw.levels && raw.levels.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--kt-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                <Crosshair size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                KEY LEVELS
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {raw.levels.slice(0, 5).map((lvl, i) => (
                  <span
                    key={i}
                    className="kt-tag"
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      padding: '3px 8px',
                    }}
                  >
                    {lvl.label || lvl.type}: {lvl.price?.toFixed(raw.symbol === 'XAUUSD' ? 2 : 4)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Signals */}
          {raw.signals && raw.signals.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--kt-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                <Zap size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                SIGNALS
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {raw.signals.slice(0, 6).map((s, i) => (
                  <span key={i} className="kt-tag gold" style={{ fontSize: 9, padding: '2px 7px' }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Score Breakdown */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--kt-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
              <BarChart3 size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
              SCORE BREAKDOWN
            </div>
            <ScoreBreakdown score={score} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Scanning Animation ── */

function ScanningOverlay() {
  return (
    <div className="kt-card" style={{ padding: 48, textAlign: 'center' }}>
      <style>{`
        @keyframes smc-scan-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes smc-scan-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
        .smc-scan-ring {
          width: 48px; height: 48px; margin: 0 auto 16px;
          border: 2px solid var(--kt-border-soft);
          border-top-color: var(--kt-gold);
          border-radius: 999px;
          animation: smc-scan-spin 1.2s linear infinite;
        }
        .smc-scan-label {
          animation: smc-scan-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
      <div className="smc-scan-ring" />
      <div className="kt-kicker smc-scan-label" style={{ margin: 0 }}>SCANNING MARKETS…</div>
      <p style={{ color: 'var(--kt-muted)', marginTop: 8, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        Running SMC analysis across 6 pairs
      </p>
    </div>
  )
}

/* ── Main Component ── */

export default function SMCScreener() {
  const [biasFilter, setBiasFilter] = useState<'all' | 'buy' | 'sell'>('all')
  const [minScore, setMinScore] = useState(0)
  const [sortBy, setSortBy] = useState<'score' | 'symbol' | 'rr' | 'confidence'>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const { data, isLoading, error, refetch, isFetching } = useQuery<BatchEntry[]>({
    queryKey: ['smc-batch'],
    queryFn: () => api('/api/smc/batch?tf=1D'),
    refetchInterval: 60_000,
    staleTime: 60_000,
  })

  // Track last refresh time
  useEffect(() => {
    if (!isFetching && data) setLastRefresh(new Date())
  }, [isFetching, data])

  // Enrich entries with confluence scores
  const enriched: EnrichedEntry[] = (data ?? []).map((raw) => {
    const score = computeConfluence(raw)
    const rr = raw.meta?.rr ?? 1.5
    return { raw, score, rr }
  })

  // Filter
  let filtered = enriched
  if (biasFilter === 'buy') filtered = filtered.filter((e) => e.raw.bias === 'bullish')
  else if (biasFilter === 'sell') filtered = filtered.filter((e) => e.raw.bias === 'bearish')

  if (minScore > 0) filtered = filtered.filter((e) => e.score.total >= minScore)

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let va: number | string, vb: number | string
    if (sortBy === 'score') { va = a.score.total; vb = b.score.total }
    else if (sortBy === 'symbol') { va = a.raw.symbol; vb = b.raw.symbol }
    else if (sortBy === 'rr') { va = a.rr; vb = b.rr }
    else { va = a.raw.confidence; vb = b.raw.confidence }

    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
  })

  // Average score
  const avgScore = enriched.length > 0
    ? Math.round(enriched.reduce((sum, e) => sum + e.score.total, 0) / enriched.length)
    : 0


  const biasFilters: Array<{ key: typeof biasFilter; label: string; icon?: React.ReactNode }> = [
    { key: 'all', label: 'ALL' },
    { key: 'buy', label: 'BUY', icon: <TrendingUp size={10} /> },
    { key: 'sell', label: 'SELL', icon: <TrendingDown size={10} /> },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Target size={18} style={{ color: 'var(--kt-gold)' }} />
          <div>
            <span className="kt-kicker" style={{ margin: 0 }}>SMC SETUP SCREENER</span>
            {data && (
              <span style={{ color: 'var(--kt-muted)', fontSize: 11, marginLeft: 10, fontFamily: 'var(--font-mono)' }}>
                {enriched.length} pairs · avg score {avgScore} · refreshed {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <button
          className="kt-tag"
          onClick={() => refetch()}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: isFetching ? 0.5 : 1 }}
          disabled={isFetching}
        >
          <RefreshCw size={12} className={isFetching ? 'spin' : ''} style={isFetching ? { animation: 'smc-scan-spin 1s linear infinite' } : undefined} />
          {isFetching ? 'Scanning…' : 'Refresh'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && <ScanningOverlay />}

      {/* Error */}
      {error && (
        <div className="kt-card" style={{ borderColor: 'rgba(255,77,77,.3)', padding: 20 }}>
          <span style={{ color: 'var(--kt-dn)' }}>Failed to load batch data. Try refreshing.</span>
        </div>
      )}

      {/* Controls */}
      {!isLoading && data && (
        <>
          {/* Stats Row */}
          <div className="kt-stat-grid kt-stat-grid-4" style={{ marginBottom: 16 }}>
            <div className="kt-stat">
              <div className="kt-stat-label">Pairs Scanned</div>
              <div className="kt-stat-value gold">{enriched.length}</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">Avg Score</div>
              <div className="kt-stat-value" style={{ color: scoreColor(avgScore) }}>{avgScore}</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">Strong Setups</div>
              <div className="kt-stat-value" style={{ color: 'var(--kt-up)' }}>
                {enriched.filter((e) => e.score.total >= 60).length}
              </div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">In Kill Zone</div>
              <div className="kt-stat-value" style={{ color: 'var(--kt-gold)' }}>
                {enriched.filter((e) => e.raw.killZone && e.raw.killZone !== 'none').length}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}>
            <Shield size={13} style={{ color: 'var(--kt-muted)' }} />
            {/* Bias Filter */}
            {biasFilters.map((f) => (
              <button
                key={f.key}
                className={`kt-tag ${biasFilter === f.key ? 'gold' : ''}`}
                onClick={() => setBiasFilter(f.key)}
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: biasFilter === f.key ? 'var(--kt-goldf)' : 'transparent',
                  transition: 'all .15s',
                }}
              >
                {f.icon}
                {f.label}
              </button>
            ))}

            <span style={{ width: 1, height: 20, background: 'var(--kt-border-soft)', margin: '0 4px' }} />

            {/* Score Threshold */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={11} style={{ color: 'var(--kt-muted)' }} />
              <select
                className="kt-select"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                style={{ height: 28, fontSize: 10, padding: '0 24px 0 8px' }}
              >
                <option value={0}>All Scores</option>
                <option value={25}>25+</option>
                <option value={40}>40+</option>
                <option value={50}>50+</option>
                <option value={60}>60+ (Strong)</option>
                <option value={75}>75+ (Premium)</option>
              </select>
            </div>

            <span style={{ width: 1, height: 20, background: 'var(--kt-border-soft)', margin: '0 4px' }} />

            {/* Sort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowUpDown size={11} style={{ color: 'var(--kt-muted)' }} />
              <select
                className="kt-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                style={{ height: 28, fontSize: 10, padding: '0 24px 0 8px' }}
              >
                <option value="score">Score</option>
                <option value="symbol">Symbol</option>
                <option value="rr">R:R</option>
                <option value="confidence">Confidence</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--kt-border-soft)',
                  borderRadius: 6,
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--kt-muted)',
                  fontSize: 10,
                  transition: 'all .15s',
                }}
              >
                {sortDir === 'desc' ? '↓' : '↑'}
              </button>
            </div>

            <span style={{ marginLeft: 'auto', color: 'var(--kt-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              {sorted.length} results
            </span>
          </div>

          {/* Card Grid */}
          {sorted.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
              {sorted.map((entry) => (
                <PairCard key={entry.raw.symbol} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="kt-card" style={{ textAlign: 'center', padding: 48 }}>
              <ScanLine size={28} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
              <div style={{ color: 'var(--kt-text)', fontWeight: 600, marginBottom: 6 }}>
                No setups match filters
              </div>
              <div style={{ color: 'var(--kt-muted)', fontSize: 13 }}>
                {minScore > 0
                  ? `No pairs scored above ${minScore}. Try lowering the threshold.`
                  : 'No active setups detected. Markets may be in equilibrium.'}
              </div>
            </div>
          )}

          {/* Auto-refresh indicator */}
          <div style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            color: 'var(--kt-dim)',
            fontSize: 10,
            letterSpacing: 1.2,
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
          }}>
            <div className="animate-pulse-dot" style={{
              width: 5, height: 5, borderRadius: 999,
              background: isFetching ? 'var(--kt-gold)' : 'var(--kt-up)',
              boxShadow: isFetching ? '0 0 6px var(--kt-gold)' : '0 0 6px var(--kt-up)',
            }} />
            auto-refresh 60s
          </div>
        </>
      )}
    </div>
  )
}
