@echo off
setlocal enableextensions
title Purnaa Cap Nesting - Install

REM ==========================================================================
REM  Purnaa Cap Nesting - INSTALL (Windows)
REM  Safe to run more than once. Installs Git + Node if missing, then gets
REM  the app and its components. If anything fails it points to Max, not Ryan.
REM ==========================================================================

REM Install/update the app folder THIS launcher belongs to (COMMAND CENTER lives
REM inside the app), the same way start.bat does. When run from inside an
REM existing copy it updates that copy in place instead of cloning a stray second
REM copy. Only a true first-time run from outside any app folder falls back to
REM cloning the standard path.
set "APP_DIR=%USERPROFILE%\purnaa-cap-nesting"
for %%I in ("%~dp0..") do set "CANDIDATE=%%~fI"
if exist "%CANDIDATE%\package.json" if exist "%CANDIDATE%\server\serve.js" set "APP_DIR=%CANDIDATE%"
set "REPO_URL=https://github.com/Mfessler78/purnaa-cap-nesting.git"

echo.
echo ============================================================
echo   Purnaa Cap Nesting - INSTALL
echo ============================================================
echo.
echo This sets up the app on this computer.
echo It is safe to run this more than once.
echo.

REM --- winget must be present (ships with Windows 10/11) ---
where winget >nul 2>&1
if errorlevel 1 (
  echo [PROBLEM] Windows "winget" was not found on this computer.
  echo It is needed to install Git and Node.
  goto :fail
)

REM --- Install Git if it is not already there ---
where git >nul 2>&1
if errorlevel 1 (
  echo Installing Git ...
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
) else (
  echo Git is already installed.
)

REM --- Install Node LTS if it is not already there ---
where node >nul 2>&1
if errorlevel 1 (
  echo Installing Node LTS ...
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
) else (
  echo Node is already installed.
)

REM --- Re-check. Right after a fresh install Windows has not refreshed PATH
REM     in THIS window, so node/git will look missing until a new window. ---
where git >nul 2>&1
if errorlevel 1 goto :reopen
where node >nul 2>&1
if errorlevel 1 goto :reopen

REM --- Get the code (clone first time, pull after) ---
if exist "%APP_DIR%\.git" (
  echo Updating existing copy ...
  pushd "%APP_DIR%"
  git pull
  if errorlevel 1 ( popd & goto :fail )
  popd
) else (
  echo Downloading the app ...
  git clone "%REPO_URL%" "%APP_DIR%"
  if errorlevel 1 goto :fail
)

REM --- Install the app's components ---
echo Installing app components (this can take a few minutes) ...
pushd "%APP_DIR%"
call npm install
if errorlevel 1 ( popd & goto :fail )
popd

echo.
echo ============================================================
echo   INSTALL COMPLETE
echo ============================================================
echo.
echo You can now start the app by double-clicking start.bat
echo.
pause
exit /b 0

:reopen
echo.
echo ------------------------------------------------------------
echo   ALMOST THERE - ONE MORE STEP
echo ------------------------------------------------------------
echo.
echo Git and/or Node were just installed. Windows needs you to
echo close this window and run INSTALL again so it can see them.
echo.
echo   1. Close this window.
echo   2. Double-click install.bat again.
echo.
pause
exit /b 0

:fail
echo.
echo ------------------------------------------------------------
echo   SOMETHING WENT WRONG
echo ------------------------------------------------------------
echo.
echo Please take a PHOTO of this whole window and send it to Max.
echo Do NOT ask Ryan - this one is Max's to fix.
echo.
pause
exit /b 1
