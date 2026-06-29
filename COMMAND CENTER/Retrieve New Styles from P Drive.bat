@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - RETRIEVE NEW STYLES from the P drive (Windows)
REM
REM  Double-click to copy the NEWEST style backup from the P drive onto this
REM  computer (the mapped styles + the fabric list). Use this on a freshly
REM  set-up machine, or any machine that should match the latest mapped styles.
REM
REM  This updates DATA only. It does NOT change program code - use
REM  "update.bat" for that. Connect to the P drive first.
REM ===========================================================================
set "APP_DIR=%USERPROFILE%\purnaa-cap-nesting"

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
