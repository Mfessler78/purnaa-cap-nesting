@echo off
setlocal enableextensions
title Purnaa Cap Nesting - Update

REM ==========================================================================
REM  Purnaa Cap Nesting - UPDATE (Windows)
REM  Pulls the latest code from GitHub. Only reinstalls components if the
REM  package-lock.json actually changed. This is a deliberate, separate step;
REM  starting the app never updates on its own.
REM ==========================================================================

set "APP_DIR=%USERPROFILE%\purnaa-cap-nesting"

if not exist "%APP_DIR%\.git" (
  echo [PROBLEM] The app is not installed yet.
  echo Please double-click install.bat first.
  goto :fail
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
