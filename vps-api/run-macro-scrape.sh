#!/bin/bash
cd /home/ubuntu/projects/aegis-terminal/vps-api
export FIRECRAWL_API_KEY=fc-3673cb1426994104a857455bd3b61a7c
node scrape-macro.js 2>&1 | tee -a /tmp/macro-scrape.log
