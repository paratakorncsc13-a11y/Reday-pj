@echo off
rem ReDay v2 - start a local web server and open the app in your browser.
rem Needs ONE of: jwebserver (JDK 18+), python 3, or Node.js (npx). No install/build step for the app itself.
cd /d "%~dp0"
set PORT=5173
echo ReDay: http://localhost:%PORT%/   (press Ctrl+C to stop)
start "" "http://localhost:%PORT%/"
where jwebserver >nul 2>nul && ( jwebserver -p %PORT% -b 127.0.0.1 -d "%cd%" & goto :eof )
where python >nul 2>nul && ( python -m http.server %PORT% --bind 127.0.0.1 & goto :eof )
where npx >nul 2>nul && ( npx --yes serve -l %PORT% . & goto :eof )
echo.
echo No web server found. Install a JDK (jwebserver), Python 3 or Node.js, or use any static file server on this folder.
pause
