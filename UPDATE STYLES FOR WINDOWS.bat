@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - UPDATE STYLES from the P drive (Windows)
REM
REM  Double-click to copy the NEWEST style backup from the P drive onto this
REM  computer (the mapped styles + the fabric list). Use this on a freshly
REM  set-up machine, or any machine that should match the latest mapped styles.
REM
REM  This updates DATA only. It does NOT change program code - use
REM  "UPDATE FOR WINDOWS" for that. Connect to the P drive first.
REM ===========================================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pdrive-update-styles.ps1"
echo.
pause
