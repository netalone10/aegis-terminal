#!/bin/bash
cd /home/ubuntu/projects/aegis-terminal/vps-api
node scrape-calendar.js 2>&1 | tee -a /tmp/calendar-scrape.log
