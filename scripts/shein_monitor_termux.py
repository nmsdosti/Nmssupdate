#!/usr/bin/env python3
"""
🚀 SHEIN Monitor for Android Termux
Monitors SHEIN India item counts and sends Telegram alerts when threshold is exceeded.
NO Firecrawl required - uses direct SHEIN API.

Setup in Termux:
    pkg install python
    pip install requests
    python shein_monitor_termux.py

Configuration: Edit the CONFIG section below.
"""

import time
import requests
import json
from datetime import datetime
import sys
import os

# ============================================================
# ⚙️ CONFIGURATION - EDIT THESE VALUES
# ============================================================

CONFIG = {
    # Telegram Bot Settings
    "BOT_TOKEN": "YOUR_TELEGRAM_BOT_TOKEN",  # Get from @BotFather
    "CHAT_IDS": ["-1002977953919"],  # Your Telegram chat/group IDs
    
    # Main Category to Monitor
    # Add ALL the page URLs you want to monitor in MONITOR_URLS below.
    # The script will auto-build the API endpoint from each page URL.
    # Supports both /c/<code> and /s/<code> style links.
    "MONITOR_URLS": [
        "https://www.sheinindia.in/s/footwear-206291",
    ],
    
    # Thresholds
    "ITEM_THRESHOLD": 1000,  # Alert if item count exceeds this
    "JUMP_THRESHOLD": 100,   # Alert if count jumps by this much
    
    # Timing
    "CHECK_INTERVAL": 5,     # Seconds between checks
    "MAX_RETRIES": 3,        # Retries on failure
    
    # Additional Categories to Monitor (optional)
    # Each can have its own threshold and subtract_from_total option
    "CATEGORIES": [
        # Example:
        # {
        #     "name": "Women",
        #     "url": "https://www.sheinindia.in/api/category/...",
        #     "threshold": 500,
        #     "subtract_from_total": False
        # }
    ]
}

# ============================================================
# 🤖 MONITOR CLASS - DO NOT EDIT BELOW
# ============================================================

class SheinMonitor:
    def __init__(self):
        self.session = requests.Session()
        self.last_count = None
        self.consecutive_failures = 0
        
        # Validate config
        if CONFIG["BOT_TOKEN"] == "YOUR_TELEGRAM_BOT_TOKEN":
            print("❌ ERROR: Please set your Telegram BOT_TOKEN in the CONFIG section!")
            sys.exit(1)
        
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.sheinindia.in/sheinverse/c/sverse-5939-37961',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Origin': 'https://www.sheinindia.in',
            'Connection': 'keep-alive'
        }
        
        print("=" * 50)
        print("🚀 SHEIN Monitor for Termux")
        print("=" * 50)
        print(f"📊 Threshold: {CONFIG['ITEM_THRESHOLD']} items")
        print(f"📈 Jump Alert: +{CONFIG['JUMP_THRESHOLD']} items")
        print(f"⏱️  Interval: {CONFIG['CHECK_INTERVAL']}s")
        print(f"📱 Telegram Chats: {len(CONFIG['CHAT_IDS'])}")
        print(f"📁 Categories: {len(CONFIG['CATEGORIES'])}")
        print("=" * 50)
        
        # Send startup message
        self.send_telegram("🟢 <b>SHEIN Monitor Started!</b>\n\n"
                          f"📊 Threshold: {CONFIG['ITEM_THRESHOLD']}\n"
                          f"📈 Jump Alert: +{CONFIG['JUMP_THRESHOLD']}\n"
                          f"⏱️ Interval: {CONFIG['CHECK_INTERVAL']}s\n"
                          f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    def fetch_item_count(self, api_url):
        """Fetch item count from SHEIN API with cache busting"""
        cache_buster = f"&_t={int(time.time() * 1000)}"
        url = api_url + cache_buster
        
        for attempt in range(CONFIG["MAX_RETRIES"]):
            try:
                response = self.session.get(url, headers=self.headers, timeout=15)
                
                if response.status_code == 403:
                    print(f"⚠️  403 Blocked (attempt {attempt + 1}/{CONFIG['MAX_RETRIES']})")
                    time.sleep(5 * (attempt + 1))
                    continue
                
                response.raise_for_status()
                data = response.json()
                
                total_results = data.get('totalResults', 0)
                self.consecutive_failures = 0
                return {"success": True, "count": total_results}
                
            except requests.exceptions.RequestException as e:
                print(f"❌ Request error (attempt {attempt + 1}): {e}")
                time.sleep(3)
            except json.JSONDecodeError as e:
                print(f"❌ JSON parse error: {e}")
                time.sleep(3)
        
        self.consecutive_failures += 1
        return {"success": False, "error": "Max retries exceeded"}
    
    def send_telegram(self, message):
        """Send message to all configured Telegram chats"""
        api_url = f"https://api.telegram.org/bot{CONFIG['BOT_TOKEN']}/sendMessage"
        
        for chat_id in CONFIG["CHAT_IDS"]:
            try:
                payload = {
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": False
                }
                resp = requests.post(api_url, json=payload, timeout=10)
                if resp.status_code == 200:
                    print(f"✅ Telegram sent to {chat_id}")
                else:
                    print(f"❌ Telegram error ({chat_id}): {resp.status_code}")
            except Exception as e:
                print(f"❌ Telegram failed ({chat_id}): {e}")
    
    def check_and_alert(self):
        """Main monitoring logic"""
        now = datetime.now().strftime('%H:%M:%S')
        
        # Fetch main category count
        print(f"\n[{now}] 📡 Fetching SHEIN data...")
        result = self.fetch_item_count(CONFIG["MAIN_URL"])
        
        if not result["success"]:
            print(f"❌ Failed to fetch: {result.get('error', 'Unknown')}")
            if self.consecutive_failures >= 5:
                self.send_telegram(f"⚠️ <b>Monitor Alert</b>\n\nFailed {self.consecutive_failures} consecutive times!\n⏰ {now}")
            return
        
        raw_count = result["count"]
        print(f"📦 Raw count: {raw_count}")
        
        # Check additional categories
        total_subtraction = 0
        category_alerts = []
        
        for cat in CONFIG["CATEGORIES"]:
            cat_result = self.fetch_item_count(cat["url"])
            if cat_result["success"]:
                cat_count = cat_result["count"]
                print(f"   📁 {cat['name']}: {cat_count}")
                
                if cat.get("subtract_from_total", False):
                    total_subtraction += cat_count
                elif cat_count >= cat.get("threshold", 9999999):
                    category_alerts.append({
                        "name": cat["name"],
                        "count": cat_count,
                        "threshold": cat["threshold"]
                    })
        
        # Calculate final count
        item_count = max(0, raw_count - total_subtraction)
        
        if total_subtraction > 0:
            print(f"📊 Adjusted: {raw_count} - {total_subtraction} = {item_count}")
        
        # Check thresholds
        exceeds_threshold = item_count > CONFIG["ITEM_THRESHOLD"]
        jump_detected = (self.last_count is not None and 
                        (item_count - self.last_count) >= CONFIG["JUMP_THRESHOLD"])
        has_category_alerts = len(category_alerts) > 0
        
        # Build and send alert if needed
        if exceeds_threshold or jump_detected or has_category_alerts:
            msg_parts = ["🚨 <b>SHEIN Monitor Alert!</b>\n"]
            
            if total_subtraction > 0:
                msg_parts.append(f"📦 Adjusted: <b>{item_count:,}</b> items")
                msg_parts.append(f"(Raw: {raw_count:,} - {total_subtraction:,})")
            else:
                msg_parts.append(f"📦 Stock: <b>{item_count:,}</b> items")
            
            msg_parts.append(f"Threshold: {CONFIG['ITEM_THRESHOLD']:,}")
            
            if self.last_count is not None:
                msg_parts.append(f"Previous: {self.last_count:,}")
            
            if exceeds_threshold and jump_detected:
                msg_parts.append(f"\n⚠️ Exceeded + jumped by +{item_count - self.last_count:,}!")
            elif exceeds_threshold:
                msg_parts.append("\n⚠️ Exceeded threshold!")
            elif jump_detected:
                msg_parts.append(f"\n⚠️ Jump: +{item_count - self.last_count:,} items!")
            
            if has_category_alerts:
                msg_parts.append("\n\n📁 Categories:")
                for alert in category_alerts:
                    msg_parts.append(f"• {alert['name']}: {alert['count']} (limit: {alert['threshold']})")
            
            msg_parts.append(f"\n\n🔗 {CONFIG['MAIN_PAGE_URL']}")
            msg_parts.append(f"\n⏰ {now}")
            
            self.send_telegram("\n".join(msg_parts))
            print("🔔 ALERT SENT!")
        else:
            print(f"✅ OK: {item_count} items (threshold: {CONFIG['ITEM_THRESHOLD']})")
        
        self.last_count = item_count
    
    def run(self):
        """Main loop"""
        print("\n🟢 Monitoring started. Press Ctrl+C to stop.\n")
        
        while True:
            try:
                self.check_and_alert()
                print(f"⏳ Next check in {CONFIG['CHECK_INTERVAL']}s...")
                time.sleep(CONFIG["CHECK_INTERVAL"])
                
            except KeyboardInterrupt:
                print("\n\n🛑 Stopping monitor...")
                self.send_telegram("🔴 <b>SHEIN Monitor Stopped</b>\n\n"
                                  f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                break
            except Exception as e:
                print(f"❌ Error: {e}")
                time.sleep(5)


# ============================================================
# 🚀 ENTRY POINT
# ============================================================

if __name__ == "__main__":
    # Clear screen for Termux
    os.system('clear' if os.name == 'posix' else 'cls')
    
    print("""
    ╔═══════════════════════════════════════╗
    ║   🛍️  SHEIN Monitor for Termux  🛍️    ║
    ║        No Firecrawl Required          ║
    ╚═══════════════════════════════════════╝
    """)
    
    monitor = SheinMonitor()
    monitor.run()
