@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - first-time setup (Windows)
REM
REM  Double-click this once on a new computer. It downloads a PRIVATE copy of
REM  Node into this folder and builds the app. Needs the internet once. Nothing
REM  is installed system-wide and nothing needs admin rights.
REM
REM  After it finishes, double-click  "START FOR WINDOWS.bat"  to run the app.
REM ===========================================================================
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

echo.
pause
