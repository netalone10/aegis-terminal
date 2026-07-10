import { useState, useEffect, useRef, useCallback } from 'react'
import { API } from './config'

export interface PriceTick {
  symbol: string
  bid: number
  ask: number
  spread: number
  time: string
  updated: number
}

const WS_URL = API.WS_PRICES
const RECONNECT_DELAY = 2000
const MAX_RECONNECT = 10

export function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, PriceTick>>({})
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      retriesRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'snapshot' && msg.data) {
          // Server sends: { type: 'snapshot', data: { XAUUSD: {...}, EURUSD: {...}, ... } }
          setPrices(prev => {
            const next = { ...prev }
            for (const [sym, tick] of Object.entries(msg.data)) {
              next[sym] = { ...(tick as PriceTick), updated: Date.now() }
            }
            return next
          })
        } else if (msg.type === 'price' && msg.data?.symbol) {
          // Server sends: { type: 'price', data: { symbol, bid, ask, spread, time, updated } }
          const tick = msg.data
          setPrices(prev => ({ ...prev, [tick.symbol]: { ...tick, updated: Date.now() } }))
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null
      if (retriesRef.current < MAX_RECONNECT) {
        retriesRef.current++
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY * retriesRef.current)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const getPrice = useCallback(
    (symbol: string): PriceTick | null => prices[symbol] ?? null,
    [prices],
  )

  return { prices, getPrice, isConnected }
}
