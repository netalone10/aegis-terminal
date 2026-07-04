import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { MacroSparkline } from './MacroSparkline'
import { useNavigate } from 'react-router-dom'

interface MacroLatest {
  indicator: string
  label: string
  category: string
  unit: string
  value: number | null
  prevValue: number | null
  changePct: number | null
  date: string
}

export function MacroWidget() {
  const navigate = useNavigate()
  const { data: indicators } = useQuery<MacroLatest[]>({
    queryKey: ['macro-latest'],
    queryFn: () => api('/api/macro/latest'),
    refetchInterval: 300_000,
    retry: 1,
  })

  if (!indicators || indicators.length === 0) return null

  const top6 = indicators.slice(0, 6)

  return (
    <div style={{
      background: '#12121a',
      border: '1px solid #1e1e2e',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1e1e2e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>
          📊 Macro Overview
        </span>
        <button
          onClick={() => navigate('/macro')}
          style={{
            background: 'none', border: 'none', color: '#f59e0b',
            fontSize: 11, cursor: 'pointer', fontWeight: 600,
          }}
        >
          View All →
        </button>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1,
        background: '#1e1e2e',
      }}>
        {top6.map((ind) => {
          const change = Number(ind.changePct ?? 0)
          const changeColor = change > 0 ? '#22c55e' : change < 0 ? '#ef4444' : '#64748b'
          return (
            <div
              key={ind.indicator}
              onClick={() => navigate(`/macro?indicator=${ind.indicator}`)}
              style={{
                background: '#12121a',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#18182a')}
              onMouseLeave={e => (e.currentTarget.style.background = '#12121a')}
            >
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                {ind.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                {ind.value != null ? ind.value.toLocaleString() : '—'}
                <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>{ind.unit}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: changeColor }}>
                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                </span>
                <MacroSparkline series={[]} width={60} height={20} color={changeColor} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
