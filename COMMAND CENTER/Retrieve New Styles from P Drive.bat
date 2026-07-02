@echo off
setlocal enableextensions
REM ===========================================================================
REM  Purnaa Cap Nesting - RETRIEVE STYLES from the P drive (Windows)
REM
REM  Double-click to bring this computer's styles into line with the shared set
REM  on the P drive: new styles are added, changed ones updated, unchanged ones
REM  skipped (fast), and styles deleted/renamed on the shared set are removed
REM  here too (a named warning prints for each; every removal stays recoverable
REM  from the sync folder's backups\). The live progress prints in this window.
REM
REM  This updates DATA only. It does NOT change program code - use "update.bat"
REM  for that. Connect to the P drive first.
REM
REM  All the real work is in scripts\pdrive-retrieve.js so Mac and Windows run
REM  the exact same logic. This launcher just finds the app + Node and runs it.
REM ===========================================================================
REM Operate on the app folder THIS launcher belongs to (COMMAND CENTER lives
REM inside the app), so we read the SAME data\backup.json the running app wrote.
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

where node >nul 2>&1
if errorlevel 1 (
  echo [PROBLEM] Node is not set up yet on this computer.
  echo Please double-click install.bat first.
  echo.
  pause
  exit /b 1
)

pushd "%APP_DIR%"
node "scripts\pdrive-retrieve.js"
set "STATUS=%errorlevel%"
popd
echo.
pause
exit /b %STATUS%
