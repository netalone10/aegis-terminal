import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MacroCardProps {
  label: string
  value: string
  trend: 'up' | 'down' | 'flat'
  data?: number[]
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 50
  const h = 16
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`
  ).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0 opacity-70">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function MacroCard({ label, value, trend, data }: MacroCardProps) {
  const sparkColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#6b7280'

  return (
    <div className="bg-card rounded-xl border border-border hover:border-border-hover transition-all duration-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-text-dim font-mono uppercase tracking-widest">{label}</span>
        {trend === 'up' && <TrendingUp size={14} className="text-emerald" />}
        {trend === 'down' && <TrendingDown size={14} className="text-red" />}
        {trend === 'flat' && <Minus size={14} className="text-text-muted" />}
      </div>
      <span className="text-xl font-bold font-mono text-text">{value}</span>
      {data && (
        <div className="mt-2">
          <MiniSparkline data={data} color={sparkColor} />
        </div>
      )}
    </div>
  )
}
