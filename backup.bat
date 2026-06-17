@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - back up the styles and fabrics (Windows)
REM
REM  Double-click this file to make a backup copy of all mapped styles and the
REM  fabric list. It creates a dated folder inside the "backups" folder.
REM
REM  AFTER it finishes: copy that dated folder onto the office NAS (or a USB
REM  stick). Do this once a week. That copy is your safety net if this computer
REM  ever dies.
REM ===========================================================================

cd /d "%~dp0"

call npm run backup

echo.
pause
