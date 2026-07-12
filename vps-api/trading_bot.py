#!/usr/bin/env python3
"""
trading_bot.py — Crypto signal engine with 35 indicators
Replaces Node.js crypto-signal-engine.js
"""

import os
import time
import logging
import hashlib
import hmac
import requests
import numpy as np
import pandas as pd
from datetime import datetime
from urllib.parse import urlencode

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/home/ubuntu/projects/aegis-terminal/vps-api/trading_bot.log')
    ]
)
logger = logging.getLogger(__name__)

BYBIT_BASE = "https://api.bybit.com"
BYBIT_API_KEY = os.getenv("BYBIT_API_KEY", "")
BYBIT_API_SECRET = os.getenv("BYBIT_API_SECRET", "")

DEFAULT_TIMEFRAME = "60"  # Bybit uses minutes: 1/5/15/60/240/D
DEFAULT_LIMIT = 200
THRESHOLD_MIN = 70
WIN_PROB_MIN = 80


# === INDICATOR HELPERS ===

def _ema(series, period):
    """Exponential Moving Average"""
    return series.ewm(span=period, adjust=False).mean()


def _sma(series, period):
    """Simple Moving Average"""
    return series.rolling(window=period).mean()


def _rsi(series, period=14):
    """Relative Strength Index"""
    delta = series.diff()
    gain = delta.where(delta > 0, 0).ewm(alpha=1/period, adjust=False).mean()
    loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/period, adjust=False).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def _atr(df, period=14):
    """Average True Range"""
    high, low, close = df["high"], df["low"], df["close"]
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def _adx(df, period=14):
    """Average Directional Index"""
    high, low = df["high"], df["low"]
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
    atr = _atr(df, period)
    plus_di = 100 * _ema(plus_dm, period) / atr
    minus_di = 100 * _ema(minus_dm, period) / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    adx = _ema(dx, period)
    return adx, plus_di, minus_di


class TradingBot:
    def __init__(self, symbol_list=None, timeframe=DEFAULT_TIMEFRAME, limit=DEFAULT_LIMIT):
        self.symbol_list = symbol_list
        self.timeframe = timeframe
        self.limit = limit
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # API key + signature set per-request in _sign(), not in session
        logger.info(f"TradingBot initialized: timeframe={timeframe}, limit={limit}")

    def _sign(self, params):
        """Generate HMAC signature for Bybit V5 API
        Format: timestamp + apiKey + rawQueryString (NOT sorted)
        """
        if not BYBIT_API_SECRET:
            return params, {}
        timestamp = str(int(time.time() * 1000))
        params["timestamp"] = timestamp
        query = "&".join(f"{k}={v}" for k, v in params.items())
        sign_str = timestamp + BYBIT_API_KEY + query
        signature = hmac.new(
            BYBIT_API_SECRET.encode(), sign_str.encode(), hashlib.sha256
        ).hexdigest()
        headers = {
            "X-BAPI-API-KEY": BYBIT_API_KEY,
            "X-BAPI-SIGN": signature,
            "X-BAPI-TIMESTAMP": timestamp,
        }
        return params, headers

    def _get(self, endpoint, params=None):
        """GET request to Bybit V5 API"""
        url = f"{BYBIT_BASE}{endpoint}"
        try:
            params, auth_headers = self._sign(params or {})
            resp = self.session.get(url, params=params, headers=auth_headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data.get("retCode") != 0:
                logger.warning(f"Bybit API error: {data.get('retMsg')}")
                return None
            return data.get("result")
        except Exception as e:
            logger.error(f"Request failed: {e}")
            return None

    def _post(self, endpoint, params=None):
        """POST request to Bybit V5 API (signed)"""
        url = f"{BYBIT_BASE}{endpoint}"
        try:
            params, auth_headers = self._sign(params or {})
            resp = self.session.post(url, json=params, headers=auth_headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data.get("retCode") != 0:
                logger.warning(f"Bybit API error: {data.get('retMsg')}")
                return None
            return data.get("result")
        except Exception as e:
            logger.error(f"Request failed: {e}")
            return None

    def fetch_all_symbols(self):
        """Fetch all USDT-M perpetual futures symbols"""
        result = self._get("/v5/market/instruments-info", {"category": "linear"})
        if not result:
            return []
        symbols = [
            item["symbol"] for item in result.get("list", [])
            if item.get("quoteCoin") == "USDT" and item.get("status") == "Trading"
        ]
        logger.info(f"Fetched {len(symbols)} USDT-M symbols")
        return symbols

    def fetch_klines(self, symbol):
        """Fetch candlestick data, return DataFrame"""
        params = {
            "category": "linear",
            "symbol": symbol,
            "interval": self.timeframe,
            "limit": self.limit,
        }
        result = self._get("/v5/market/kline", params)
        if not result or not result.get("list"):
            return None

        candles = result["list"][::-1]  # oldest first
        df = pd.DataFrame(candles, columns=[
            "timestamp", "open", "high", "low", "close", "volume", "turnover"
        ])
        df["timestamp"] = pd.to_datetime(df["timestamp"].astype(int), unit="ms")
        for col in ["open", "high", "low", "close", "volume", "turnover"]:
            df[col] = df[col].astype(float)
        df.set_index("timestamp", inplace=True)
        return df

    def compute_indicators(self, df):
        """Compute 35 indicators, return dict of signals"""
        if df is None or len(df) < 50:
            return None

        signals = {}
        c, h, l, v = df["close"], df["high"], df["low"], df["volume"]

        # === TREND ===
        sma20 = _sma(c, 20)
        sma50 = _sma(c, 50)
        signals["sma20"] = c.iloc[-1] > sma20.iloc[-1]
        signals["sma50"] = c.iloc[-1] > sma50.iloc[-1]

        ema12, ema26 = _ema(c, 12), _ema(c, 26)
        signals["ema_cross"] = ema12.iloc[-1] > ema26.iloc[-1]

        macd_line = ema12 - ema26
        signal_line = _ema(macd_line, 9)
        macd_hist = macd_line - signal_line
        signals["macd"] = macd_hist.iloc[-1] > 0

        tenkan = (h.rolling(9).max() + l.rolling(9).min()) / 2
        kijun = (h.rolling(26).max() + l.rolling(26).min()) / 2
        senkou_a = ((tenkan + kijun) / 2).shift(26)
        senkou_b = ((h.rolling(52).max() + l.rolling(52).min()) / 2).shift(26)
        signals["ichimoku"] = c.iloc[-1] > senkou_a.iloc[-1] and c.iloc[-1] > senkou_b.iloc[-1]

        signals["parabolic_sar"] = c.iloc[-1] > l.rolling(10).min().iloc[-1]

        adx, plus_di, minus_di = _adx(df)
        signals["adx"] = adx.iloc[-1] > 25 and plus_di.iloc[-1] > minus_di.iloc[-1]

        atr14 = _atr(df, 14)
        lower_band = (h + l) / 2 - 3 * atr14
        signals["supertrend"] = c.iloc[-1] > lower_band.iloc[-1]

        # === MOMENTUM ===
        rsi = _rsi(c, 14)
        signals["rsi"] = 30 < rsi.iloc[-1] < 70

        low14, high14 = l.rolling(14).min(), h.rolling(14).max()
        stoch_k = 100 * (c - low14) / (high14 - low14)
        stoch_d = stoch_k.rolling(3).mean()
        signals["stochastic"] = stoch_k.iloc[-1] > stoch_d.iloc[-1] and stoch_k.iloc[-1] < 80

        tp = (h + l + c) / 3
        sma_tp = tp.rolling(20).mean()
        mad = tp.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
        cci = (tp - sma_tp) / (0.015 * mad)
        signals["cci"] = cci.iloc[-1] > 0

        willr = -100 * (high14 - c) / (high14 - low14)
        signals["williams_r"] = willr.iloc[-1] > -80

        signals["roc"] = ((c - c.shift(10)) / c.shift(10) * 100).iloc[-1] > 0

        mf = tp * v
        pos_mf = mf.where(tp > tp.shift(), 0).rolling(14).sum()
        neg_mf = mf.where(tp < tp.shift(), 0).rolling(14).sum()
        mfi = 100 - (100 / (1 + pos_mf / neg_mf))
        signals["mfi"] = 20 < mfi.iloc[-1] < 80

        bp = c - l
        tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
        uo = (4 * bp.rolling(7).sum()/tr.rolling(7).sum() +
              2 * bp.rolling(14).sum()/tr.rolling(14).sum() +
              bp.rolling(28).sum()/tr.rolling(28).sum()) / 7 * 100
        signals["ultimate_oscillator"] = uo.iloc[-1] > 50

        ema3 = _ema(_ema(_ema(c, 15), 15), 15)
        trix = ((ema3 - ema3.shift()) / ema3.shift() * 100)
        signals["trix"] = trix.iloc[-1] > 0

        # === VOLATILITY ===
        bb_mid = _sma(c, 20)
        bb_std = c.rolling(20).std()
        bb_upper, bb_lower = bb_mid + 2*bb_std, bb_mid - 2*bb_std
        signals["bollinger"] = bb_lower.iloc[-1] < c.iloc[-1] < bb_upper.iloc[-1]

        kc_mid = _ema(c, 20)
        signals["keltner"] = kc_mid.iloc[-1] - 2*atr14.iloc[-1] < c.iloc[-1] < kc_mid.iloc[-1] + 2*atr14.iloc[-1]

        dc_upper, dc_lower = h.rolling(20).max(), l.rolling(20).min()
        signals["donchian"] = c.iloc[-1] > (dc_upper.iloc[-1] + dc_lower.iloc[-1]) / 2

        bb_width = (bb_upper - bb_lower) / bb_mid
        signals["bb_width"] = bb_width.iloc[-1] < 0.1

        # === VOLUME ===
        obv = (v * np.where(c > c.shift(), 1, -1)).cumsum()
        signals["obv"] = obv.iloc[-1] > _sma(obv, 20).iloc[-1]

        vol_sma = _sma(v, 20)
        signals["volume_spike"] = v.iloc[-1] > 2 * vol_sma.iloc[-1]

        pvo = ((_ema(v, 12) - _ema(v, 26)) / _ema(v, 26) * 100)
        signals["pvo"] = pvo.iloc[-1] > 0

        efi = (c - c.shift()) * v
        signals["efi"] = _sma(efi, 13).iloc[-1] > 0

        mom = c - c.shift(14)
        pos_sum = mom.where(mom > 0, 0).rolling(14).sum()
        neg_sum = mom.where(mom < 0, 0).abs().rolling(14).sum()
        cmo = 100 * (pos_sum - neg_sum) / (pos_sum + neg_sum)
        signals["cmo"] = cmo.iloc[-1] > 0

        # === ADVANCED ===
        # KAMA
        direction = (c - c.shift(10)).abs()
        volatility = c.diff().abs().rolling(10).sum()
        er = direction / volatility
        sc = (er * (2/3 - 2/31) + 2/31) ** 2
        kama = c.copy()
        for i in range(10, len(c)):
            kama.iloc[i] = kama.iloc[i-1] + sc.iloc[i] * (c.iloc[i] - kama.iloc[i-1])
        signals["kama"] = c.iloc[-1] > kama.iloc[-1]

        t3 = _ema(_ema(_ema(c, 7), 7), 7)
        signals["t3"] = c.iloc[-1] > t3.iloc[-1]

        roc14 = (c - c.shift(14)) / c.shift(14) * 100
        roc11 = (c - c.shift(11)) / c.shift(11) * 100
        coppock = _sma(roc14 + roc11, 10)
        signals["coppock"] = coppock.iloc[-1] > 0

        zlema = _ema(2*c - c.shift(5), 20)
        signals["zlema"] = c.iloc[-1] > zlema.iloc[-1]

        wma_half = c.rolling(10).apply(lambda x: np.average(x, weights=range(1, len(x)+1)), raw=True)
        wma_full = c.rolling(20).apply(lambda x: np.average(x, weights=range(1, len(x)+1)), raw=True)
        hma = _sma(2*wma_half - wma_full, int(np.sqrt(20)))
        signals["hma"] = c.iloc[-1] > hma.iloc[-1]

        w = np.exp(-((np.arange(20) - 0.85*20)**2) / (2*6**2))
        alma = c.rolling(20).apply(lambda x: np.average(x, weights=w), raw=True)
        signals["alma"] = c.iloc[-1] > alma.iloc[-1]

        hl2 = (h + l) / 2
        fisher = 0.5 * np.log((hl2 - hl2.rolling(10).min()) / (hl2.rolling(10).max() - hl2))
        signals["fisher"] = fisher.iloc[-1] > 0

        vm_plus = (h - l.shift()).abs().rolling(14).sum()
        vm_minus = (l - h.shift()).abs().rolling(14).sum()
        tr_sum = pd.concat([h-l, (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1).rolling(14).sum()
        signals["vortex"] = (vm_plus/tr_sum).iloc[-1] > (vm_minus/tr_sum).iloc[-1]

        ppo = ((_ema(c, 12) - _ema(c, 26)) / _ema(c, 26) * 100)
        signals["ppo"] = ppo.iloc[-1] > 0

        quant50 = c.rolling(50).quantile(0.5)
        signals["quant"] = c.iloc[-1] > quant50.iloc[-1]

        sma200 = _sma(c, 200)
        signals["regime"] = c.iloc[-1] > sma200.iloc[-1] and adx.iloc[-1] > 20

        # Return only boolean signals
        return {k: v for k, v in signals.items() if not k.startswith("_")}

    def calculate_threshold_and_win_probability(self, signals):
        """Calculate threshold and win probability from signals"""
        if not signals:
            return 0, 0
        bullish = sum(1 for v in signals.values() if v)
        bearish = sum(1 for v in signals.values() if not v)
        total = bullish + bearish
        if total == 0:
            return 0, 0
        threshold = (bullish / total) * 100
        win_probability = (bullish / total) * 100
        return threshold, win_probability

    def scan_and_filter(self):
        """Scan all coins, filter threshold >=70%, win_prob >=80%, return top1"""
        symbols = self.fetch_all_symbols()
        results = []

        for i, symbol in enumerate(symbols):
            try:
                df = self.fetch_klines(symbol)
                if df is None or len(df) < 50:
                    continue

                sigs = self.compute_indicators(df)
                if not sigs:
                    continue

                threshold, win_prob = self.calculate_threshold_and_win_probability(sigs)

                if threshold >= THRESHOLD_MIN and win_prob >= WIN_PROB_MIN:
                    results.append({
                        "symbol": symbol,
                        "threshold": threshold,
                        "win_probability": win_prob,
                        "price": df["close"].iloc[-1],
                    })

                # Rate limit: 10 requests/sec
                if (i + 1) % 10 == 0:
                    time.sleep(1)

            except Exception as e:
                logger.error(f"Error scanning {symbol}: {e}")
                continue

        if not results:
            logger.info("No signals above threshold")
            return None

        results.sort(key=lambda x: (x["threshold"], x["win_probability"]), reverse=True)
        top = results[0]
        logger.info(f"Top: {top['symbol']} | threshold={top['threshold']:.1f}% | win_prob={top['win_probability']:.1f}%")
        return (top["symbol"], top["threshold"], top["win_probability"])

    def entry_order(self, symbol, usdt_amount=50, leverage=5):
        """Place market long order with ATR-based SL/TP"""
        result = self._get("/v5/market/tickers", {"category": "linear", "symbol": symbol})
        if not result or not result.get("list"):
            logger.error(f"Cannot get price for {symbol}")
            return None

        price = float(result["list"][0]["lastPrice"])
        size = round((usdt_amount * leverage) / price, 3)

        # Calculate SL/TP using ATR
        df = self.fetch_klines(symbol)
        if df is not None and len(df) >= 14:
            atr = _atr(df, 14).iloc[-1]
            sl_price = round(price - 2 * atr, 2)
            tp_price = round(price + 3 * atr, 2)
        else:
            sl_price = round(price * 0.98, 2)
            tp_price = round(price * 1.04, 4)

        order = {
            "category": "linear",
            "symbol": symbol,
            "side": "Buy",
            "orderType": "Market",
            "qty": str(size),
            "timeInForce": "GTC",
        }

        logger.info(f"ENTRY: {symbol} | size={size} | price=${price:.2f} | SL=${sl_price} | TP=${tp_price}")

        if BYBIT_API_KEY and BYBIT_API_SECRET:
            resp = self._post("/v5/order/create", order)
            if resp:
                logger.info(f"Order placed: {resp}")
                return {"order": order, "sl": sl_price, "tp": tp_price, "response": resp}
            else:
                logger.error("Order failed")
                return None
        else:
            logger.warning("No API key — dry run")
            return {"order": order, "sl": sl_price, "tp": tp_price, "dry_run": True}
