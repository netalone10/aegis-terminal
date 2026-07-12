#!/usr/bin/env python3
"""
monitor.py — Position management and trailing stop
"""

import logging

logger = logging.getLogger(__name__)


class Monitor:
    def __init__(self, client):
        self.client = client

    def get_open_positions(self):
        """Get all open positions from Bybit"""
        try:
            result = self.client._get("/v5/position/list", {"category": "linear", "settleCoin": "USDT"})
            if not result or not result.get("list"):
                return []

            positions = []
            for pos in result["list"]:
                size = float(pos.get("size", 0))
                if size > 0:
                    positions.append({
                        "symbol": pos["symbol"],
                        "side": pos["side"],
                        "size": size,
                        "entry_price": float(pos.get("avgPrice", 0)),
                        "unrealised_pnl": float(pos.get("unrealisedPnl", 0)),
                        "leverage": float(pos.get("leverage", 1)),
                        "mark_price": float(pos.get("markPrice", 0)),
                    })
            return positions

        except Exception as e:
            logger.error(f"Error getting positions: {e}")
            return []

    def trail_stop(self, symbol, trailing_percent=1.0):
        """Trail stop loss for a position"""
        try:
            result = self.client._get("/v5/market/tickers", {"category": "linear", "symbol": symbol})
            if not result or not result.get("list"):
                return False

            current_price = float(result["list"][0]["lastPrice"])

            positions = self.get_open_positions()
            position = None
            for pos in positions:
                if pos["symbol"] == symbol and pos["side"] == "Buy":
                    position = pos
                    break

            if not position:
                logger.info(f"No open long position for {symbol}")
                return False

            entry_price = position["entry_price"]
            pnl_pct = ((current_price - entry_price) / entry_price) * 100

            stop_level = entry_price * (1 + (pnl_pct - trailing_percent) / 100)

            logger.info(f"{symbol}: entry=${entry_price:.2f} | current=${current_price:.2f} | PnL={pnl_pct:.2f}% | stop=${stop_level:.2f}")

            if current_price < stop_level and pnl_pct > 0:
                logger.info(f"TRAIL STOP: Closing {symbol} at ${current_price:.2f} | PnL={pnl_pct:.2f}%")
                return self._close_position(symbol)

            return False

        except Exception as e:
            logger.error(f"Error in trail_stop for {symbol}: {e}")
            return False

    def _close_position(self, symbol):
        """Close a long position"""
        try:
            order = {
                "category": "linear",
                "symbol": symbol,
                "side": "Sell",
                "orderType": "Market",
                "qty": "0",
                "timeInForce": "GTC",
                "reduceOnly": True,
            }

            positions = self.get_open_positions()
            for pos in positions:
                if pos["symbol"] == symbol and pos["side"] == "Buy":
                    order["qty"] = str(pos["size"])
                    break

            if order["qty"] == "0":
                logger.warning(f"No position to close for {symbol}")
                return False

            if self.client._post("/v5/order/create", order):
                logger.info(f"Position closed: {symbol}")
                return True
            else:
                logger.error(f"Failed to close position: {symbol}")
                return False

        except Exception as e:
            logger.error(f"Error closing position: {e}")
            return False
