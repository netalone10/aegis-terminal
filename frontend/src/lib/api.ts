import { API, VPS_PREFIXES } from './config'

function getBase(path: string): string {
  if (path.startsWith('http')) return ''
  if (VPS_PREFIXES.some(p => path.startsWith(p))) return API.VPS_ENGINE
  return API.CF_WORKERS
}

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const base = getBase(path)
  const url = path.startsWith('http') ? path : `${base}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`API error ${res.status}: ${error}`)
  }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}
