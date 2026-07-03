@echo off
setlocal enableextensions
title Purnaa Cap Nesting - Update

REM ==========================================================================
REM  Purnaa Cap Nesting - UPDATE (Windows)
REM  Pulls the latest code from GitHub. Only reinstalls components if the
REM  package-lock.json actually changed. This is a deliberate, separate step;
REM  starting the app never updates on its own.
REM ==========================================================================

REM Update the app folder THIS launcher belongs to (COMMAND CENTER lives inside
REM the app), the same way start.bat does, so the owner's master copy updates
REM itself rather than a stray clone. Fall back to the standard path only when
REM launched from outside an app folder.
set "APP_DIR=%USERPROFILE%\purnaa-cap-nesting"
for %%I in ("%~dp0..") do set "CANDIDATE=%%~fI"
if exist "%CANDIDATE%\package.json" if exist "%CANDIDATE%\server\serve.js" set "APP_DIR=%CANDIDATE%"

if not exist "%APP_DIR%\.git" (
  echo [PROBLEM] The app is not installed yet.
  echo Please double-click install.bat first.
  goto :fail
)

REM --- Keep Node standardized: if this machine is on an older Node than the
REM     pinned minimum, upgrade it to LTS here so every computer matches.
REM     Keep MIN_NODE in sync with install.bat / start.bat. ---
set "MIN_NODE=18"
set "NODE_MAJOR=0"
for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS %MIN_NODE% (
  echo Updating Node to the required version ^(LTS^) ...
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  goto :reopen
)

pushd "%APP_DIR%"

echo.
echo ============================================================
echo   Purnaa Cap Nesting - UPDATE
echo ============================================================
echo.

REM --- Hash the lock file BEFORE pulling ---
set "BEFORE=none"
if exist "package-lock.json" for /f %%H in ('certutil -hashfile "package-lock.json" SHA256 ^| findstr /r "^[0-9a-f]"') do set "BEFORE=%%H"

echo Getting the latest version ...
git pull
if errorlevel 1 ( popd & goto :fail )

REM --- Hash the lock file AFTER pulling ---
set "AFTER=none"
if exist "package-lock.json" for /f %%H in ('certutil -hashfile "package-lock.json" SHA256 ^| findstr /r "^[0-9a-f]"') do set "AFTER=%%H"

if not "%BEFORE%"=="%AFTER%" (
  echo Components changed - updating them ...
  call npm install
  if errorlevel 1 ( popd & goto :fail )
) else (
  echo Components unchanged - nothing else to install.
)

popd
echo.
echo ============================================================
echo   UPDATE COMPLETE
echo ============================================================
echo.
echo Start the app as usual by double-clicking start.bat
echo.
pause
exit /b 0

:reopen
echo.
echo ------------------------------------------------------------
echo   ALMOST THERE - ONE MORE STEP
echo ------------------------------------------------------------
echo.
echo Node was just installed/updated. Windows needs you to close
echo this window and run UPDATE again so it can see the new version.
echo.
echo   1. Close this window.
echo   2. Double-click update.bat again.
echo.
pause
exit /b 0

:fail
echo.
echo ------------------------------------------------------------
echo   UPDATE DID NOT FINISH
echo ------------------------------------------------------------
echo.
echo First, try running install.bat again - it usually fixes this.
echo If it still fails, take a PHOTO of this whole window and send
echo it to Max. Do NOT ask Ryan - this one is Max's to fix.
echo.
pause
exit /b 1
