@echo off
rem ===============================================================
rem  Rebuild the React app and mirror it into web-dist/, the
rem  directory WorkBuddy publishes from.
rem
rem  Use this after changing anything under app/. Without it the
rem  live site keeps serving the previous build while local dev
rem  looks perfectly fine.
rem
rem  GitHub Pages does not need this: it builds app/dist itself on
rem  every push to main.
rem
rem  This file is deliberately ASCII-only, same reason as the local
rem  launcher next to it: cmd.exe parses .cmd with the OEM code page,
rem  so non-ASCII text here comes out garbled on other locales.
rem ===============================================================
setlocal
cd /d "%~dp0app"

where npm >nul 2>nul
if errorlevel 1 goto no_npm

call npm run pub:sync
if errorlevel 1 goto failed

echo.
echo [+] web-dist is up to date.
echo     Republish from the WorkBuddy panel to push it live.
echo     (GitHub Pages updates by itself on push to main.)
pause
exit /b 0

:no_npm
echo [!] npm not found. Install Node.js 20 or newer first.
pause
exit /b 1

:failed
echo [!] Sync failed. Read the message above.
pause
exit /b 1
