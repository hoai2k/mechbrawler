@echo off
rem JJK Brawler II launcher (Windows). Double-click to play.
rem Prefers node or python if installed; otherwise falls back to a pure
rem PowerShell server, which every Windows PC has built in.
rem Closing this window stops the game server.

cd /d "%~dp0"
set PORT=5174

where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting server ^(node^)...
  echo JJK Brawler II will open at http://127.0.0.1:%PORT%
  echo Keep this window open while playing. Close it to stop.
  start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:%PORT%"
  node server.mjs
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo Starting server ^(python^)...
  echo JJK Brawler II will open at http://127.0.0.1:%PORT%
  echo Keep this window open while playing. Close it to stop.
  start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:%PORT%"
  python -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

echo Starting server ^(PowerShell^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\serve.ps1" -Port %PORT%
