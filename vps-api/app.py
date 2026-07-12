#!/usr/bin/env python3
"""
app.py — Entry point for crypto trading bot
Schedule: every 15 minutes
- If no position → scan & entry top1
- If position exists → trail stop
"""

import os
import sys
import time
import json
import logging
import schedule
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from trading_bot import TradingBot
from monitor import Monitor

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/home/ubuntu/projects/aegis-terminal/vps-api/app.log')
    ]
)
logger = logging.getLogger(__name__)

STATUS_FILE = '/home/ubuntu/projects/aegis-terminal/vps-api/bot_status.json'

active_position = None
current_symbol = None

bot = TradingBot()
monitor = Monitor(bot)


def update_status(status_data):
    """Write status to JSON file for API to read"""
    status_data["updated_at"] = datetime.now().isoformat()
    with open(STATUS_FILE, 'w') as f:
        json.dump(status_data, f, indent=2)


def job():
    """Main job: scan or trail stop"""
    global active_position, current_symbol

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logger.info(f"=== Job running at {now} ===")

    update_status({"state": "scanning", "last_scan": now})

    try:
        # Check open positions
        positions = monitor.get_open_positions()

        if positions:
            # Has position → trail stop
            for pos in positions:
                symbol = pos["symbol"]
                logger.info(f"Trailing stop for {symbol}")
                closed = monitor.trail_stop(symbol, trailing_percent=1.0)
                if closed:
                    logger.info(f"Position closed: {symbol}")
                    active_position = None
                    current_symbol = None
                    update_status({"state": "idle", "last_action": f"closed {symbol}"})
                else:
                    logger.info(f"Holding: {symbol} | PnL={pos['unrealised_pnl']:.2f}")
                    update_status({
                        "state": "holding",
                        "symbol": symbol,
                        "entry_price": pos["entry_price"],
                        "mark_price": pos["mark_price"],
                        "unrealised_pnl": pos["unrealised_pnl"],
                        "leverage": pos["leverage"],
                    })
        else:
            # No position → scan & entry
            logger.info("No positions. Scanning...")
            result = bot.scan_and_filter()

            if result:
                symbol, threshold, win_prob = result
                logger.info(f"Signal: {symbol} | threshold={threshold:.1f}% | win_prob={win_prob:.1f}%")

                order_result = bot.entry_order(symbol, usdt_amount=50, leverage=5)
                if order_result:
                    active_position = order_result
                    current_symbol = symbol
                    update_status({
                        "state": "entered",
                        "symbol": symbol,
                        "threshold": threshold,
                        "win_probability": win_prob,
                        "entry": order_result,
                    })
                else:
                    update_status({"state": "entry_failed", "symbol": symbol})
            else:
                update_status({"state": "no_signal", "last_scan": now})

    except Exception as e:
        logger.error(f"Job error: {e}")
        update_status({"state": "error", "error": str(e)})

    logger.info("=== Job complete ===\n")


if __name__ == "__main__":
    logger.info("Starting crypto trading bot...")

    # Run job first time immediately
    job()

    # Schedule every 15 minutes
    schedule.every(15).minutes.do(job)

    logger.info("Scheduler started. Waiting for next run...")
    while True:
        schedule.run_pending()
        time.sleep(1)
