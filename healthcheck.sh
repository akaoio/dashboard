#!/bin/bash

# Dashboard Health Check Script
# Used by systemd and monitoring tools

# Check if Dashboard is responding
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8767/health)

if [ "$response" == "200" ]; then
    # Get health data
    health=$(curl -s http://localhost:8767/health)
    
    # Check if healthy
    if echo "$health" | grep -q '"healthy":\s*true'; then
        echo "✅ Dashboard is healthy"
        exit 0
    else
        echo "⚠️ Dashboard is unhealthy"
        echo "$health"
        exit 1
    fi
else
    echo "❌ Dashboard is not responding (HTTP $response)"
    exit 1
fi