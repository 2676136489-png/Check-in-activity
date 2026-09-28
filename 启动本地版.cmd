@echo off
rem ===============================================================
rem  Local launcher for the React version (app/).
rem
rem  Double click: installs dependencies on first run, starts the dev
rem  server in this window, and Vite opens the browser by itself once
rem  it is actually listening (no sleep-and-hope). Close this window
rem  to stop the server.
rem
rem  This file is deliberately ASCII-only. cmd.exe parses .cmd with the
rem  OEM code page, so non-ASCII text in here comes out garbled on
rem  machines with a different locale. Keep it English.
rem
rem  Want the built static version instead? Run manually:
rem      cd app && npm run build && npm run preview
rem ===============================================================
setlocal
cd /d "%~dp0app"

where npm >nul 2>nul
if errorlevel 1 goto no_npm

if not exist node_modules goto do_install
goto run

:do_install
echo [1/2] Installing dependencies, this only happens once...
call npm install
if errorlevel 1 goto install_failed

:run
echo [2/2] Starting dev server at http://localhost:5173/
echo       The browser opens by itself. Close this window to stop.
echo       Keep using this exact address: localhost and 127.0.0.1 are
echo       different origins, so they do not share the stored data.
echo.
call npm run dev -- --open
exit /b 0

:no_npm
echo [!] npm not found.
echo     Install Node.js 20 or newer first: https://nodejs.org
pause
exit /b 1

:install_failed
echo [!] npm install failed. Check your network or proxy settings.
pause
exit /b 1
