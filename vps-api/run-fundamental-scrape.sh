#!/bin/bash
cd /home/ubuntu/projects/aegis-terminal/vps-api
node scrape-forexfactory.js 2>&1 | tee -a /tmp/fundamental-scrape.log
