@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - RETRIEVE NEW STYLES from the P drive (Windows)
REM
REM  Double-click to copy EVERY style found across all P-drive backups onto this
REM  computer (the newest copy of each, + the fabric list). Use this on a freshly
REM  set-up machine, or any machine that should have all styles anyone has mapped.
REM
REM  This updates DATA only. It does NOT change program code - use
REM  "update.bat" for that. Connect to the P drive first.
REM ===========================================================================
REM Operate on the app folder THIS launcher belongs to (COMMAND CENTER lives
REM inside the app), the same way start.bat does. We read the backup folder from
REM data\backup.json: the running app writes it next to its own copy, so
REM retrieving must read the SAME copy or it sees "not set" on a stray clone.
REM Fall back to the standard install path only when launched from outside an app
REM folder (e.g. first-time setup run from the Desktop).
set "APP_DIR=%USERPROFILE%\purnaa-cap-nesting"
for %%I in ("%~dp0..") do set "CANDIDATE=%%~fI"
if exist "%CANDIDATE%\package.json" if exist "%CANDIDATE%\server\serve.js" set "APP_DIR=%CANDIDATE%"

if not exist "%APP_DIR%\.git" (
  echo [PROBLEM] The app is not installed yet.
  echo Please double-click install.bat first.
  echo.
  pause
  exit /b 1
)

REM Run the styles helper FROM the installed app folder so it reads this
REM machine's data\backup.json and writes into the app's styles\ folder.
pushd "%APP_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pdrive-update-styles.ps1"
popd
echo.
pause
