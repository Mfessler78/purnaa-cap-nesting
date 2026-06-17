@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - FULL program backup to the P drive (Windows)
REM
REM  Double-click to drop a dated .zip of the WHOLE program (code + your customer
REM  data: styles, fabrics, artwork) onto the P-drive backup folder. The big
REM  rebuildable folders (node_modules, node, dist) are left out to keep it small.
REM
REM  You must be connected to the office network / P drive first.
REM ===========================================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pdrive-backup.ps1"
echo.
pause
