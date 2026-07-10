# VPS Real-Time Dashboard — Design Spec

**Date:** 2026-07-07
**Status:** Approved
**Target:** aegisterminal.app/vps

## Overview

Real-time VPS monitoring dashboard — like Task Manager, but live. Public-facing, accessible at `/vps`. Updates every 2 seconds via WebSocket. Stisla.dev-inspired design (dark cards, progress bars, charts).

## Architecture

```
Browser → aegisterminal.app/vps (CF Pages, Next.js)
    ↓ WebSocket (wss://vps.aegisterminal.app/ws/vps)
    ↓ or REST fallback (https://vps.aegisterminal.app/api/vps/*)
VPS API (localhost:3001) — extended with system metrics
    ↓ reads /proc/* + systemctl
Node.js system collector (in-process, no separate service)
```

**Why extend existing VPS API (port 3001):**
- WebSocket infra already exists (mt5-price-poller pattern)
- Cloudflare Tunnel already configured for aegisterminal.app
- Small payload, not worth a separate service
- Single systemd service to manage

## Backend — New Endpoints

### REST

| Endpoint | Method | Response |
|----------|--------|----------|
| `/api/vps/metrics` | GET | `{ cpu, ram, disk, network, uptime }` |
| `/api/vps/processes` | GET | `{ processes: [{ pid, name, cpu, mem, command }] }` |
| `/api/vps/services` | GET | `{ services: [{ name, status, description }] }` |

### WebSocket

`/ws/vps` — pushes full metrics object every 2 seconds. Client connects, gets stream. Disconnect = stop receiving.

```json
{
  "type": "vps_metrics",
  "data": {
    "cpu": { "cores": 2, "usage": 72.4, "load": [1.75, 1.23, 0.60] },
    "ram": { "total": 3865, "used": 1843, "free": 1560, "usage": 47.7 },
    "disk": { "total": 69, "used": 41, "free": 26, "usage": 59.4 },
    "network": { "rx": 2450000, "tx": 1100000, "rxRate": 2.4, "txRate": 1.1 },
    "uptime": 684960,
    "hostname": "sg2",
    "timestamp": 1720358400000
  }
}
```

### Metrics Collection (Node.js)

| Metric | Source | Method |
|--------|--------|--------|
| CPU | `/proc/stat` | Delta between two reads (2s interval) |
| RAM | `os.totalmem()` / `os.freemem()` | Direct read |
| Disk | `child_process.exec('df /')` | Parse output |
| Network | `/proc/net/dev` | Delta bytes, compute rate |
| Uptime | `os.uptime()` | Direct read |
| Processes | `ps aux --sort=-pcpu` | Top 15 |
| Services | `systemctl list-units --type=service --state=running,failed` | Parse output |

**CPU calculation:**
```javascript
// Read /proc/stat, compute delta between two snapshots 2s apart
// cpu_usage = (total_delta - idle_delta) / total_delta * 100
```

**Network rate calculation:**
```javascript
// Read /proc/net/dev, compute delta bytes between snapshots
// rxRate = delta_rx_bytes / interval_seconds / 1024 / 1024  (MB/s)
```

## Frontend — Page `/vps`

### Layout (Stisla-inspired)

**Top row — 3 stat cards (equal width):**
- CPU Usage: circular gauge or progress bar, percentage, color-coded
- RAM Usage: same style
- Disk Usage: same style

**Middle row — Network chart:**
- Chart.js line chart, 2 data series (RX/TX)
- 60 data points (2 min rolling window)
- Y-axis: MB/s, X-axis: time
- Below chart: current RX/TX rate as stat numbers

**Bottom row — 2 columns:**
- Left: Running Services list (green checkmark) + Failed (red X)
- Right: Top Processes table (name, PID, CPU%, MEM%)

### Design Tokens (Stisla → Tailwind)

| Element | Style |
|---------|-------|
| Page bg | `bg-gray-900` |
| Card | `bg-gray-800 rounded-xl shadow-lg p-6` |
| Card title | `text-gray-400 text-sm uppercase tracking-wider` |
| Stat value | `text-3xl font-bold text-white` |
| Progress bar (good) | `bg-gradient-to-r from-green-500 to-green-400` |
| Progress bar (warn) | `bg-gradient-to-r from-yellow-500 to-yellow-400` |
| Progress bar (danger) | `bg-gradient-to-r from-red-500 to-red-400` |
| Thresholds | `<50%` green, `50-80%` yellow, `>80%` red |
| Service running | `text-green-400` with check icon |
| Service failed | `text-red-400` with X icon |
| Process table | `text-gray-300` rows, `hover:bg-gray-700` |

### Auto-reconnect

WebSocket reconnect logic:
- On disconnect: show "Reconnecting..." banner
- Exponential backoff: 1s → 2s → 4s → max 10s
- On reconnect: clear banner, resume stream

## Deployment

1. **VPS API**: Add metrics module to existing `vps-api/server.js`
2. **Frontend**: New Next.js page at `app/vps/page.tsx` in CF Pages repo
3. **CF Tunnel**: Already configured, `/vps` routes through existing tunnel
4. **No new systemd service** — extends existing `aegis-api.service`

## Security Notes

- Public dashboard, no auth needed
- Exposes: CPU, RAM, disk, network, running services, top processes
- Does NOT expose: file contents, env vars, passwords, database queries
- Process commands truncated to 80 chars (no sensitive args)
- Service list limited to custom services (filter out systemd internals)

## Scope Exclusions (v1)

- Docker container monitoring
- Disk I/O per-device breakdown
- Historical metrics / charts beyond 2 min
- Login/auth
- Alerts/notifications
- Custom widgets
