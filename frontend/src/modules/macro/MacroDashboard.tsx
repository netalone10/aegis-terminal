import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { createChart, LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────
interface MacroConfig {
  indicator: string
  label: string
  category: string
  unit: string
  enabled: boolean
  displayOrder: number
}

interface SparklineData {
  date: string
  value: number
}

interface HistoryRecord {
  date: string
  value: number
  prevValue: number | null
  changePct: number | null
}

// ── Constants ────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'inflation', 'employment', 'rates', 'commodities', 'equity']

const CATEGORY_LABELS: Record<string, string> = {
  All: 'All',
  inflation: 'Inflation',
  employment: 'Employment',
  rates: 'Rates',
  commodities: 'Commodities',
  equity: 'Equity',
}

const RANGES = ['3m', '6m', '1y', '2y', '5y']

// ── Component ────────────────────────────────────────────────────────
export default function MacroDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedIndicator = searchParams.get('indicator') || 'VIX'
  const [activeCategory, setActiveCategory] = useState('All')
  const [range, setRange] = useState('1y')

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const lineRef = useRef<ISeriesApi<SeriesType> | null>(null)

  // ── Queries ─────────────────────────────────────────────────────────
  const { data: config } = useQuery<MacroConfig[]>({
    queryKey: ['macro-config'],
    queryFn: () => api('/api/macro/config'),
    staleTime: 600_000,
    retry: 1,
  })

  const {
    data: sparkline,
    isLoading: sparklineLoading,
    refetch: refetchSparkline,
  } = useQuery<{ indicator: string; label: string; unit: string; series: SparklineData[] }>({
    queryKey: ['macro-sparkline', selectedIndicator, range],
    queryFn: () => api(`/api/macro/sparkline?indicator=${selectedIndicator}&range=${range}`),
    enabled: !!selectedIndicator,
    staleTime: 300_000,
    retry: 1,
  })

  const { data: history } = useQuery<{
    indicator: string; label: string; unit: string; records: HistoryRecord[]
  }>({
    queryKey: ['macro-history', selectedIndicator],
    queryFn: () => api(`/api/macro/history?indicator=${selectedIndicator}&limit=50`),
    enabled: !!selectedIndicator,
    staleTime: 300_000,
    retry: 1,
  })

  // ── Derived ─────────────────────────────────────────────────────────
  const filteredIndicators = config?.filter(
    c => activeCategory === 'All' || c.category === activeCategory,
  ) || []

  const currentConfig = config?.find(c => c.indicator === selectedIndicator)
  const latestRecord = history?.records?.[0]

  // ── Lightweight Charts ──────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0a0a10' },
        textColor: '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: { mode: 0 },
      timeScale: {
        borderColor: '#1e1e2e',
        timeVisible: false,
      },
      rightPriceScale: { borderColor: '#1e1e2e' },
      autoSize: true,
    })

    chartRef.current = chart

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: 'rgba(245,158,11,0.3)',
      priceLineWidth: 1,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: '#f59e0b',
      crosshairMarkerBorderColor: '#12121a',
      crosshairMarkerBorderWidth: 2,
    })
    lineRef.current = lineSeries

    return () => {
      chart.remove()
      chartRef.current = null
      lineRef.current = null
    }
  }, [])

  // Update chart data when sparkline changes
  useEffect(() => {
    if (!sparkline?.series || sparkline.series.length < 2 || !lineRef.current) return

    const data = sparkline.series.map(pt => ({
      time: pt.date as any,
      value: pt.value,
    }))

    lineRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [sparkline])

  // Handle resize
  useEffect(() => {
    if (!chartContainerRef.current) return
    const ro = new ResizeObserver(() => {
      chartRef.current?.applyOptions({ width: chartContainerRef.current!.clientWidth })
    })
    ro.observe(chartContainerRef.current)
    return () => ro.disconnect()
  }, [])

  const handleRefresh = () => {
    refetchSparkline()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <div style={{
            fontSize: 10, color: '#f59e0b', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2,
          }}>
            Fundamental Analysis
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>
            <BarChart3 size={20} style={{ color: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }} />
            Macro Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Economic indicators, rates, commodities, and equity indices
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleRefresh}
            style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
              color: '#f59e0b', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: '#64748b',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#22c55e', animation: 'pulse-dot 2s infinite',
            }} />
            Live · 6h refresh
          </span>
        </div>
      </div>

      {/* ── Main layout: sidebar + content ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>

        {/* ── Left sidebar ──────────────────────────────────────────── */}
        <div style={{
          width: 200, flexShrink: 0, display: 'flex',
          flexDirection: 'column', gap: 8,
        }}>
          {/* Category tabs */}
          <div style={{
            background: '#12121a', border: '1px solid #1e1e2e', borderRadius: 10,
            padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  background: activeCategory === cat ? 'rgba(245,158,11,0.12)' : 'transparent',
                  border: 'none', borderRadius: 6, padding: '6px 10px',
                  textAlign: 'left', fontSize: 12,
                  fontWeight: activeCategory === cat ? 700 : 500,
                  color: activeCategory === cat ? '#f59e0b' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>

          {/* Indicator list */}
          <div style={{
            background: '#12121a', border: '1px solid #1e1e2e', borderRadius: 10,
            padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
            flex: 1, overflow: 'auto',
          }}>
            {filteredIndicators.length === 0 && (
              <div style={{ padding: '12px 10px', fontSize: 11, color: '#64748b' }}>
                No indicators
              </div>
            )}
            {filteredIndicators.map(ind => (
              <button
                key={ind.indicator}
                onClick={() => setSearchParams({ indicator: ind.indicator })}
                style={{
                  background: selectedIndicator === ind.indicator ? 'rgba(245,158,11,0.12)' : 'transparent',
                  border: 'none', borderRadius: 6, padding: '6px 10px',
                  textAlign: 'left', fontSize: 12,
                  fontWeight: selectedIndicator === ind.indicator ? 700 : 500,
                  color: selectedIndicator === ind.indicator ? '#f59e0b' : '#e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {ind.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Current value + range selector */}
          <div style={{
            background: '#12121a', border: '1px solid #1e1e2e', borderRadius: 10,
            padding: '16px 20px', display: 'flex', alignItems: 'center',
            gap: 20, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                {currentConfig?.label || selectedIndicator}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 800, color: '#e2e8f0',
                fontFamily: 'var(--font-mono)', marginTop: 2,
              }}>
                {latestRecord?.value != null ? latestRecord.value.toLocaleString() : '—'}
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>
                  {currentConfig?.unit}
                </span>
              </div>
            </div>

            {latestRecord?.changePct != null && (
              <div style={{
                padding: '4px 10px', borderRadius: 6,
                background: latestRecord.changePct > 0
                  ? 'rgba(34,197,94,0.12)'
                  : 'rgba(239,68,68,0.12)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {latestRecord.changePct > 0 ? (
                  <TrendingUp size={12} style={{ color: '#22c55e' }} />
                ) : latestRecord.changePct < 0 ? (
                  <TrendingDown size={12} style={{ color: '#ef4444' }} />
                ) : (
                  <Minus size={12} style={{ color: '#64748b' }} />
                )}
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: latestRecord.changePct > 0 ? '#22c55e'
                    : latestRecord.changePct < 0 ? '#ef4444' : '#64748b',
                }}>
                  {latestRecord.changePct > 0 ? '+' : ''}
                  {Number(latestRecord.changePct).toFixed(1)}%
                </span>
              </div>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={{
                    background: range === r ? 'rgba(245,158,11,0.12)' : 'transparent',
                    border: `1px solid ${range === r ? 'rgba(245,158,11,0.25)' : '#1e1e2e'}`,
                    borderRadius: 4, padding: '3px 8px', fontSize: 10,
                    fontWeight: 600, color: range === r ? '#f59e0b' : '#64748b',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* ── Chart ────────────────────────────────────────────────── */}
          <div style={{
            background: '#12121a', border: '1px solid #1e1e2e', borderRadius: 10,
            padding: 16, minHeight: 400, position: 'relative',
          }}>
            {sparklineLoading ? (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#64748b', fontSize: 13, zIndex: 1,
              }}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
                Loading chart…
              </div>
            ) : sparkline?.series && sparkline.series.length > 0 ? (
              <div>
                <div style={{
                  marginBottom: 8, color: '#64748b', fontSize: 11,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>{sparkline.series.length} data points</span>
                  <span>·</span>
                  <span>{sparkline.series[0]?.date}</span>
                  <span>to</span>
                  <span>{sparkline.series[sparkline.series.length - 1]?.date}</span>
                  <span style={{ marginLeft: 'auto', color: '#f59e0b', fontWeight: 600 }}>
                    {sparkline.label}
                  </span>
                </div>
                <div ref={chartContainerRef} style={{ width: '100%', height: 360 }} />
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 360, color: '#64748b', fontSize: 13,
              }}>
                No chart data available
              </div>
            )}
          </div>

          {/* ── History table ────────────────────────────────────────── */}
          {history?.records && history.records.length > 0 && (
            <div style={{
              background: '#12121a', border: '1px solid #1e1e2e',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #1e1e2e',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>
                  History
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {history.records.length} records
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
                      {['Date', 'Value', 'Previous', 'Change', 'Trend'].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 16px', textAlign: 'left',
                            color: '#64748b', fontWeight: 600, fontSize: 11,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.records.map((rec, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid rgba(30,30,46,0.5)',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '7px 16px', color: '#e2e8f0' }}>
                          {rec.date}
                        </td>
                        <td style={{
                          padding: '7px 16px', color: '#e2e8f0',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {rec.value?.toLocaleString() ?? '—'}
                        </td>
                        <td style={{
                          padding: '7px 16px', color: '#64748b',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {rec.prevValue?.toLocaleString() ?? '—'}
                        </td>
                        <td style={{
                          padding: '7px 16px',
                          color: rec.changePct != null
                            ? Number(rec.changePct) > 0 ? '#22c555'
                              : rec.changePct < 0 ? '#ef4444' : '#64748b'
                            : '#64748b',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {rec.changePct != null
                            ? `${Number(rec.changePct) > 0 ? '+' : ''}${Number(rec.changePct).toFixed(1)}%`
                            : '—'}
                        </td>
                        <td style={{ padding: '7px 16px' }}>
                          {rec.changePct != null && (
                            rec.changePct > 0 ? (
                              <TrendingUp size={14} style={{ color: '#22c55e' }} />
                            ) : rec.changePct < 0 ? (
                              <TrendingDown size={14} style={{ color: '#ef4444' }} />
                            ) : (
                              <Minus size={14} style={{ color: '#64748b' }} />
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
