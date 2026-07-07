// vps-api/system-metrics.js
const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');

// ── CPU ─────────────────────────────────────────────────────
let prevCpu = null;

function readCpuStat() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  const parts = line.split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0); // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function getCpuUsage() {
  const cur = readCpuStat();
  if (!prevCpu) {
    prevCpu = cur;
    return 0;
  }
  const idleDelta = cur.idle - prevCpu.idle;
  const totalDelta = cur.total - prevCpu.total;
  prevCpu = cur;
  if (totalDelta === 0) return 0;
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 1000) / 10;
}

// ── RAM ─────────────────────────────────────────────────────
function getRam() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total: Math.round(total / 1024 / 1024),  // MB
    used: Math.round(used / 1024 / 1024),
    free: Math.round(free / 1024 / 1024),
    usage: Math.round((used / total) * 1000) / 10,
  };
}

// ── Disk ────────────────────────────────────────────────────
function getDisk() {
  try {
    const out = execSync('df / --output=size,used,avail,pcent', { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    const parts = lines[1].trim().split(/\s+/);
    return {
      total: Math.round(parseInt(parts[0]) / 1024 / 1024),  // GB
      used: Math.round(parseInt(parts[1]) / 1024 / 1024),
      free: Math.round(parseInt(parts[2]) / 1024 / 1024),
      usage: parseFloat(parts[3]),
    };
  } catch {
    return { total: 0, used: 0, free: 0, usage: 0 };
  }
}

// ── Network ─────────────────────────────────────────────────
let prevNet = null;

function readNetDev() {
  const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n');
  let rx = 0, tx = 0;
  for (const line of lines) {
    if (line.includes('eth0') || line.includes('ens') || line.includes('enp')) {
      const parts = line.trim().split(/\s+/);
      rx = parseInt(parts[1]) || 0;
      tx = parseInt(parts[9]) || 0;
      break;
    }
  }
  // Fallback: sum all interfaces except lo
  if (rx === 0 && tx === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Inter') || trimmed.startsWith('face') || trimmed.includes('lo:')) continue;
      const parts = trimmed.split(/[\s:]+/);
      if (parts.length > 10) {
        rx += parseInt(parts[1]) || 0;
        tx += parseInt(parts[9]) || 0;
      }
    }
  }
  return { rx, tx };
}

function getNetworkRate() {
  const cur = readNetDev();
  if (!prevNet) {
    prevNet = cur;
    return { rx: 0, tx: 0, rxRate: 0, txRate: 0 };
  }
  const rxDelta = cur.rx - prevNet.rx;
  const txDelta = cur.tx - prevNet.tx;
  prevNet = cur;
  return {
    rx: cur.rx,
    tx: cur.tx,
    rxRate: Math.round(rxDelta / 2 / 1024 * 100) / 100,  // KB/s
    txRate: Math.round(txDelta / 2 / 1024 * 100) / 100,
  };
}

// ── Processes ───────────────────────────────────────────────
function getTopProcesses() {
  try {
    const out = execSync(
      "ps aux --sort=-pcpu | head -11 | tail -10 | awk '{printf \"%s|%s|%s|%s|%s\\n\", $11, $2, $3, $4, $11}'",
      { encoding: 'utf8' }
    );
    return out.trim().split('\n').map(line => {
      const [command, pid, cpu, mem] = line.split('|');
      const name = command.split('/').pop().split(' ')[0];
      return {
        name: name.substring(0, 20),
        pid: parseInt(pid),
        cpu: parseFloat(cpu),
        mem: parseFloat(mem),
        command: command.substring(0, 60),
      };
    }).filter(p => p.pid);
  } catch {
    return [];
  }
}

// ── Services ────────────────────────────────────────────────
function getServices() {
  try {
    const out = execSync(
      "systemctl list-units --type=service --state=running,failed --no-pager --no-legend --plain | awk '{print $1, $3, $4}'",
      { encoding: 'utf8' }
    );
    // Filter out internal systemd services
    const internal = ['systemd-', 'dbus-', 'rsyslog', 'getty', 'serial', 'polkit', 'avahi', 'modem', 'multipath', 'networkd', 'resolved', 'udevd', 'acpid', 'chrony', 'tat_agent', 'journal', 'logind'];
    return out.trim().split('\n').map(line => {
      const parts = line.split(' ');
      const name = parts[0].replace('.service', '');
      const status = parts[1]; // active
      const sub = parts[2]; // running / failed
      return { name, status: sub, description: name };
    }).filter(s => !internal.some(i => s.name.startsWith(i)));
  } catch {
    return [];
  }
}

// ── Combined ────────────────────────────────────────────────
function getMetrics() {
  return {
    cpu: {
      cores: os.cpus().length,
      usage: getCpuUsage(),
      load: os.loadavg().map(l => Math.round(l * 100) / 100),
    },
    ram: getRam(),
    disk: getDisk(),
    network: getNetworkRate(),
    uptime: Math.round(os.uptime()),
    hostname: os.hostname(),
    timestamp: Date.now(),
  };
}

// Seed first readings (call once at startup)
function seedMetrics() {
  readCpuStat();
  readNetDev();
  // Wait 2s for second reading
  setTimeout(() => {
    getCpuUsage();
    getNetworkRate();
  }, 2000);
}

module.exports = { getMetrics, getTopProcesses, getServices, seedMetrics };
