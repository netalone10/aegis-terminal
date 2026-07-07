// frontend/src/pages/VpsDashboard.tsx
import { useState, useEffect, useRef } from 'react'
import { API } from '../lib/config'
import { Activity, Cpu, HardDrive, Wifi, Server, CheckCircle, XCircle } from 'lucide-react'

interface VpsMetrics {
  cpu: { cores: number; usage: number; load: number[] }
  ram: { total: number; used: number; free: number; usage: number }
  disk: { total: number; used: number; free: number; usage: number }
  network: { rx: number; tx: number; rxRate: number; txRate: number }
  uptime: number
  hostname: string
  timestamp: number
}

interface Process {
  name: string; pid: number; cpu: number; mem: number; command: string
}

interface Service {
  name: string; status: string; description: string
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getColor(pct: number) {
  if (pct < 50) return 'from-emerald-500 to-emerald-400'
  if (pct < 80) return 'from-amber-500 to-amber-400'
  return 'from-red-500 to-red-400'
}

function getTextColor(pct: number) {
  if (pct < 50) return 'text-emerald-400'
  if (pct < 80) return 'text-amber-400'
  return 'text-red-400'
}

function StatCard({ icon: Icon, label, value, unit, pct }: {
  icon: any; label: string; value: string; unit: string; pct: number
}) {
  return (
    <div className="bg-gray-800 rounded-xl shadow-lg p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-gray-400 text-sm uppercase tracking-wider">
        <Icon size={16} />
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-bold ${getTextColor(pct)}`}>{value}</span>
        <span className="text-gray-500 text-sm">{unit}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full bg-gradient-to-r ${getColor(pct)} transition-all duration-500`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{pct < 50 ? 'Healthy' : pct < 80 ? 'Moderate' : 'Critical'}</span>
        <span>{pct}%</span>
      </div>
    </div>
  )
}

function NetworkChart({ history }: { history: { rx: number; tx: number; time: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || history.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width = canvas.offsetWidth * 2
    const h = canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)
    const cw = w / 2
    const ch = h / 2

    ctx.clearRect(0, 0, cw, ch)

    const maxVal = Math.max(1, ...history.map(p => Math.max(p.rx, p.tx))) * 1.2

    // Grid lines
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = (ch / 4) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(cw, y)
      ctx.stroke()
    }

    // Draw line
    const drawLine = (data: number[], color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * cw
        const y = ch - (val / maxVal) * (ch - 20)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    drawLine(history.map(p => p.rx), '#34d399')
    drawLine(history.map(p => p.tx), '#60a5fa')

    // Labels
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#9ca3af'
    ctx.fillText(`↑ ${history[history.length - 1]?.rx.toFixed(1) || 0} KB/s`, 4, 14)
    ctx.fillStyle = '#60a5fa'
    ctx.fillText(`↓ ${history[history.length - 1]?.tx.toFixed(1) || 0} KB/s`, 100, 14)
  }, [history])

  return (
    <div className="bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-2 text-gray-400 text-sm uppercase tracking-wider mb-4">
        <Wifi size={16} />
        Network Throughput
      </div>
      <canvas ref={canvasRef} className="w-full h-32" />
    </div>
  )
}

export default function VpsDashboard() {
  const [metrics, setMetrics] = useState<VpsMetrics | null>(null)
  const [processes, setProcesses] = useState<Process[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [connected, setConnected] = useState(false)
  const [netHistory, setNetHistory] = useState<{ rx: number; tx: number; time: number }[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let reconnectDelay = 1000

    function connect() {
      const ws = new WebSocket(API.WS_VPS)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectDelay = 1000
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'vps_metrics') {
            setMetrics(msg.data)
            setNetHistory(prev => {
              const next = [...prev, { rx: msg.data.network.rxRate, tx: msg.data.network.txRate, time: Date.now() }]
              return next.slice(-60) // 2 min window
            })
          }
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimer.current = window.setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 10000)
          connect()
        }, reconnectDelay)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    // Fetch processes and services via REST (less frequent)
    const fetchData = async () => {
      try {
        const [procRes, svcRes] = await Promise.all([
          fetch(`${API.VPS_API}/processes`),
          fetch(`${API.VPS_API}/services`),
        ])
        const procData = await procRes.json()
        const svcData = await svcRes.json()
        setProcesses(procData.data || [])
        setServices(svcData.data || [])
      } catch {}
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)

    return () => {
      wsRef.current?.close()
      clearTimeout(reconnectTimer.current)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">VPS Status</h1>
          <p className="text-gray-400 text-sm mt-1">
            {metrics?.hostname || 'Loading...'} • Uptime: {metrics ? formatUptime(metrics.uptime) : '--'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-sm text-gray-400">{connected ? 'Live' : 'Reconnecting...'}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Cpu}
          label="CPU Usage"
          value={metrics?.cpu.usage.toFixed(1) || '--'}
          unit={`% • ${metrics?.cpu.cores || 0} cores`}
          pct={metrics?.cpu.usage || 0}
        />
        <StatCard
          icon={Activity}
          label="Memory"
          value={metrics?.ram.usage.toFixed(1) || '--'}
          unit={`% • ${metrics?.ram.used || 0}/${metrics?.ram.total || 0} MB`}
          pct={metrics?.ram.usage || 0}
        />
        <StatCard
          icon={HardDrive}
          label="Disk"
          value={metrics?.disk.usage.toFixed(1) || '--'}
          unit={`% • ${metrics?.disk.used || 0}/${metrics?.disk.total || 0} GB`}
          pct={metrics?.disk.usage || 0}
        />
      </div>

      {/* Network Chart */}
      <NetworkChart history={netHistory} />

      {/* Services + Processes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Services */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-2 text-gray-400 text-sm uppercase tracking-wider mb-4">
            <Server size={16} />
            Services
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {services.map(s => (
              <div key={s.name} className="flex items-center justify-between py-1.5 border-b border-gray-700 last:border-0">
                <span className="text-gray-300 text-sm truncate">{s.name}</span>
                <span className={`flex items-center gap-1 text-xs ${s.status === 'running' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {s.status === 'running' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {s.status}
                </span>
              </div>
            ))}
            {services.length === 0 && <p className="text-gray-500 text-sm">Loading...</p>}
          </div>
        </div>

        {/* Processes */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-2 text-gray-400 text-sm uppercase tracking-wider mb-4">
            <Activity size={16} />
            Top Processes
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left py-1">Process</th>
                  <th className="text-right py-1">CPU%</th>
                  <th className="text-right py-1">MEM%</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p, i) => (
                  <tr key={`${p.pid}-${i}`} className="border-t border-gray-700 hover:bg-gray-700/50">
                    <td className="py-1.5 text-gray-300 truncate max-w-[120px]" title={p.command}>{p.name}</td>
                    <td className={`py-1.5 text-right ${p.cpu > 50 ? 'text-red-400' : p.cpu > 20 ? 'text-amber-400' : 'text-gray-300'}`}>{p.cpu}%</td>
                    <td className="py-1.5 text-right text-gray-300">{p.mem}%</td>
                  </tr>
                ))}
                {processes.length === 0 && (
                  <tr><td colSpan={3} className="text-gray-500 text-sm py-2">Loading...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer timestamp */}
      <div className="text-center text-xs text-gray-600">
        Last update: {metrics ? new Date(metrics.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '--'}
      </div>
    </div>
  )
}
