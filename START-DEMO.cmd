@echo off
cd /d "%~dp0"
set "LOCAL_DEMO=1"
echo Open http://localhost:3000 in your browser after the server starts.
echo Close this window or press Ctrl+C to stop the local server.
node server.mjs
pause
