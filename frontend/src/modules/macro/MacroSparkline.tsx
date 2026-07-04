import { useRef, useEffect } from 'react'

interface Props {
  series: { date: string; value: number }[]
  width?: number
  height?: number
  color?: string
}

export function MacroSparkline({ series, width = 120, height = 40, color = '#f59e0b' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || series.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const values = series.map(s => s.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const pad = 2

    ctx.clearRect(0, 0, width, height)

    // Draw line
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'

    values.forEach((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (v - min) / range) * (height - pad * 2)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Fill gradient below line
    const lastX = pad + ((values.length - 1) / (values.length - 1)) * (width - pad * 2)
    ctx.lineTo(lastX, height)
    ctx.lineTo(pad, height)
    ctx.closePath()

    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, color + '30')
    gradient.addColorStop(1, color + '05')
    ctx.fillStyle = gradient
    ctx.fill()
  }, [series, width, height, color])

  if (series.length < 2) {
    return <div style={{ width, height, background: '#1e1e2e', borderRadius: 4 }} />
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
    />
  )
}
