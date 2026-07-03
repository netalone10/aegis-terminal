CREATE TABLE IF NOT EXISTS signal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  bias TEXT NOT NULL,
  confidence INTEGER,
  price REAL,
  entry REAL,
  sl REAL,
  tp REAL,
  rr REAL,
  result TEXT DEFAULT 'open',
  reason TEXT,
  confluence TEXT,
  timeframe TEXT DEFAULT 'H1',
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);
