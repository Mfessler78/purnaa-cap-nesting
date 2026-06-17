@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - start / restart the app (Windows host)
REM
REM  Double-click this icon to start the app. Double-click it AGAIN any time to
REM  restart it - it frees the port and starts fresh, so "double-click again" is
REM  the universal fix. While healthy it sits MINIMIZED in the taskbar; you only
REM  look at the website in your browser. If anything goes wrong a message box
REM  pops up telling you what to do.
REM
REM  The app runs on this computer only. Other office PCs open it in a browser
REM  using the link from the "Copy link" button in the app's top-right corner.
REM ===========================================================================

REM --- Relaunch ourselves minimized once, then the real work runs minimized. --
if not "%~1"=="__min" (
  start "Purnaa Cap Nesting" /min "%~f0" __min
  exit /b
)

setlocal
cd /d "%~dp0"
set "PORT=4173"

REM --- 1. Free the port: kill any instance already running, so this is a reset.
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>nul
)

REM --- 2. Find Node (bundled copy first, then a system install). -------------
set "NODE_EXE="
if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul && set "NODE_EXE=node"
)

REM --- 3. If Node or the built app is missing, this PC just needs setup. -----
if not defined NODE_EXE goto needsetup
if not exist "%~dp0dist\index.html" goto needsetup

REM --- 4. Open the browser to the app on this computer. ----------------------
start "" "http://localhost:%PORT%"

REM --- 5. Run the server (blocks here while the app is healthy). -------------
"%NODE_EXE%" "%~dp0server\serve.js"

REM --- 6. If we reach here, the server stopped or failed to start. -----------
call :popup "The app has stopped. To start it again, close this window and double-click the icon. If it keeps failing, see the 'If it's broken' sheet." "App stopped"
exit /b 1

REM --- First-time setup needed: point them at setup.bat. --------------------
:needsetup
call :popup "First-time setup is needed on this computer. Close this, then double-click  setup.bat  - it downloads everything and sets up automatically (needs the internet once). When it finishes, double-click this icon again." "Setup needed"
exit /b 1

REM --- Helper: show an always-visible message box (works even while minimized).
:popup
powershell -NoProfile -Command "(New-Object -ComObject Wscript.Shell).Popup('%~1',0,'Purnaa Cap Nesting - %~2',48) | Out-Null"
goto :eof
