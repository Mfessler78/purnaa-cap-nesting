@echo off
REM ===========================================================================
REM  Purnaa Cap Nesting - UPDATE this computer to the newest version (Windows)
REM
REM  Double-click this any time the owner has published a new version. It pulls
REM  the newest CODE from GitHub and rebuilds the app. Your local data (fabrics,
REM  mapped styles) is kept - only the program code is updated. When it finishes,
REM  double-click "START FOR WINDOWS.bat" to run the newest version.
REM ===========================================================================
setlocal
cd /d "%~dp0"

REM --- Must be a real clone (a plain folder copy cannot update). --------------
if not exist "%~dp0.git" (
  call :popup "This copy is not connected to GitHub, so it cannot update. Reinstall it with git clone (ask the owner for the steps)." "Cannot update"
  goto :end
)

REM --- Git must be installed on this PC. --------------------------------------
where git >nul 2>nul
if errorlevel 1 (
  call :popup "Git is not installed on this computer. Install 'Git for Windows' once, then try again." "Git needed"
  goto :end
)

REM --- Find Node: bundled private copy first, then a system install. ----------
set "HAVE_NODE="
if exist "%~dp0node\node.exe" (
  set "PATH=%~dp0node;%PATH%"
  set "HAVE_NODE=1"
) else (
  where node >nul 2>nul && set "HAVE_NODE=1"
)
if not defined HAVE_NODE (
  call :popup "Node is not set up yet on this computer. Double-click setup.bat first, then try again." "Setup needed"
  goto :end
)

echo.
echo   Getting the newest version from GitHub...
for /f "delims=" %%h in ('certutil -hashfile package-lock.json SHA256 ^| findstr /r "^[0-9a-f]"') do set "BEFORE_LOCK=%%h"

REM --ff-only: only a clean fast-forward.  --autostash: keep this PC's local
REM data edits, update, then put them back - so using the app never blocks it.
git pull --ff-only --autostash
if errorlevel 1 (
  call :popup "Could not download the update. Check the internet and your GitHub sign-in. If it mentions a conflict with local changes, tell the owner before doing anything else." "Update failed"
  goto :end
)

for /f "delims=" %%h in ('certutil -hashfile package-lock.json SHA256 ^| findstr /r "^[0-9a-f]"') do set "AFTER_LOCK=%%h"

REM --- Only reinstall building blocks if the parts list actually changed. -----
if not "%BEFORE_LOCK%"=="%AFTER_LOCK%" (
  echo   The parts list changed - reinstalling building blocks ^(a few minutes^)...
  call npm ci
  if errorlevel 1 (
    call :popup "The update downloaded but installing the new parts failed. Try setup.bat, then start the app again." "Update failed"
    goto :end
  )
)

echo   Rebuilding the app...
call npm run build
if errorlevel 1 (
  call :popup "The update downloaded but the rebuild failed. Try setup.bat, then start the app again." "Update failed"
  goto :end
)

echo.
echo   Update complete.
call :popup "Update complete. Now double-click START FOR WINDOWS to run the newest version." "Done"
goto :end

:popup
powershell -NoProfile -Command "(New-Object -ComObject Wscript.Shell).Popup('%~1',0,'Purnaa Cap Nesting - %~2',64) | Out-Null"
goto :eof

:end
echo.
pause
