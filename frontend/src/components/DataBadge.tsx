import { useState, useEffect } from 'react'

interface DataBadgeProps {
  source?: string
  className?: string
}

export default function DataBadge({ source, className }: DataBadgeProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(iv)
  }, [])

  const wib = new Date(time.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const hh = wib.getHours().toString().padStart(2, '0')
  const mm = wib.getMinutes().toString().padStart(2, '0')

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--kt-muted)',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--kt-up)',
        boxShadow: '0 0 8px rgba(70,201,127,.6)',
        animation: 'pulse-dot 2s ease-in-out infinite',
      }} />
      LIVE {hh}:{mm} WIB
      {source && <span style={{ opacity: 0.6 }}>· {source}</span>}
    </span>
  )
}
