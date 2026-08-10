#!/bin/bash
# JJK Brawler II launcher (macOS). Double-click to play.
# Starts a local server with whatever runtime the system has (node, python3,
# or the ruby that ships with macOS) and opens the game in your browser.

cd "$(dirname "$0")" || exit 1
PORT="${PORT:-5174}"
URL="http://127.0.0.1:$PORT"

# Already running? Just open it.
if curl -s -o /dev/null --max-time 1 "$URL"; then
  open "$URL"
  exit 0
fi

SERVER_PID=""
if command -v node >/dev/null 2>&1; then
  echo "Starting server (node)…"
  PORT="$PORT" node server.mjs &
  SERVER_PID=$!
elif command -v python3 >/dev/null 2>&1; then
  echo "Starting server (python3)…"
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER_PID=$!
elif [ -x /usr/bin/ruby ]; then
  echo "Starting server (system ruby)…"
  /usr/bin/ruby -run -e httpd -- . --port="$PORT" --bind-address=127.0.0.1 >/dev/null 2>&1 &
  SERVER_PID=$!
else
  echo "No usable runtime found (looked for node, python3, ruby)."
  echo "Install any one of them and run this again."
  read -r -n 1 -p "Press any key to close…"
  exit 1
fi

trap '[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null' EXIT

# Wait for the server, then open the game.
for _ in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 1 "$URL"; then break; fi
  sleep 0.25
done
open "$URL"

echo
echo "JJK Brawler II is running at $URL"
echo "Keep this window open while playing. Close it (or press Ctrl+C) to stop."
wait "$SERVER_PID"
