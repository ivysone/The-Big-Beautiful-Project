#!/bin/bash

echo "🛑 Stopping all servers..."

pkill -f uvicorn
pkill -f "python3 app.py"
pkill -f "http.server 5500"

echo "✅ All servers stopped!"
