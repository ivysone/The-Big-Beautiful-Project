#!/bin/bash

echo "🚀 Starting Pixel Adventure..."

# Kill any old processes first
pkill -f uvicorn 2>/dev/null
pkill -f "python3 app.py" 2>/dev/null
pkill -f "http.server 5500" 2>/dev/null

# Start backend
echo "📡 Starting Backend (port 8000)..."
uvicorn main:app --reload --port 8000 &

# Wait 2 seconds
sleep 2

# Start dashboard
echo "�� Starting Dashboard (port 8050)..."
cd dashboard && python3 app.py &
cd ..

# Wait 2 seconds
sleep 2

# Start frontend
echo "🎮 Starting Game (port 5500)..."
python3 -m http.server 5500 &

# Wait 2 seconds
sleep 3

echo ""
echo "✅ Everything is running!"
echo ""
echo "📱 OPEN IN BROWSER:"
echo "   🎮 Game:      http://localhost:5500/intro.html"
echo "   📊 Dashboard: http://localhost:8050"
echo ""
echo "To stop: ./stop.sh"
echo ""
