@echo off
setlocal enableextensions
title Purnaa Cap Nesting - Running

REM ==========================================================================
REM  Purnaa Cap Nesting - START (Windows)
REM  Builds the latest code and runs the office server on port 4173, then
REM  opens the browser. Keep the window open while using the app.
REM ==========================================================================

REM Run the app folder THIS launcher belongs to (COMMAND CENTER lives inside the
REM app). End users get the clone at %USERPROFILE%\purnaa-cap-nesting; the owner's
REM master copy can live elsewhere. Deriving the app folder from the launcher's
REM own location (parent of COMMAND CENTER) runs whichever copy you double-clicked
REM from, so the master machine starts the copy that holds the styles. Fall back
REM to the standard install path when launched from outside an app folder (e.g. a
REM first-time user running COMMAND CENTER from the Desktop before install).
set "APP_DIR=%USERPROFILE%\purnaa-cap-nesting"
for %%I in ("%~dp0..") do set "CANDIDATE=%%~fI"
if exist "%CANDIDATE%\package.json" if exist "%CANDIDATE%\server\serve.js" set "APP_DIR=%CANDIDATE%"
set "URL=http://localhost:4173"

if not exist "%APP_DIR%\.git" (
  echo [PROBLEM] The app is not installed yet.
  echo Please double-click install.bat first.
  goto :fail
)

REM --- Refuse to start on a Node older than the pinned minimum, so every
REM     computer runs the same modern Node. install.bat / update.bat do the
REM     actual upgrade; here we just stop with a clear pointer. Keep MIN_NODE
REM     in sync with those. ---
set "MIN_NODE=18"
set "NODE_MAJOR=0"
for /f "tokens=1 delims=v." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS %MIN_NODE% (
  echo [PROBLEM] This computer's Node is too old ^(need %MIN_NODE% or newer^).
  echo Please double-click install.bat to update it, then start again.
  goto :fail
)

pushd "%APP_DIR%"

echo.
echo ============================================================
echo   Purnaa Cap Nesting
echo ============================================================
echo.
echo Starting the app. The first start after an update takes a
echo little longer because it rebuilds.
echo.
echo   *** KEEP THIS WINDOW OPEN while you use the app.    ***
echo   *** Close it when you are finished to stop the app. ***
echo.

REM --- Rebuild only when the code actually changed (git-stamp check) ---
REM We record the git revision dist\ was built from in dist\.built-rev. If HEAD
REM still matches, the build is current and we skip the slow rebuild for an
REM instant start. update.bat moves HEAD when it pulls new code, so the next
REM start rebuilds. Anything unknown (no build, no stamp, git missing) -> build.
set "HEAD_REV="
for /f "delims=" %%R in ('git rev-parse HEAD 2^>nul') do set "HEAD_REV=%%R"
set "BUILT_REV="
if exist "dist\.built-rev" set /p BUILT_REV=<"dist\.built-rev"
if exist "dist\index.html" if defined HEAD_REV if "%HEAD_REV%"=="%BUILT_REV%" goto :skipbuild
echo Preparing the app (rebuilding) ...
call npm run build
if errorlevel 1 ( popd & goto :fail )
>"dist\.built-rev" echo %HEAD_REV%
goto :builddone
:skipbuild
echo The app is already up to date - starting instantly.
:builddone

REM --- Open the browser a few seconds after the server starts ---
echo Opening your browser at %URL% ...
start "" /min cmd /c "timeout /t 3 >nul & start %URL%"

REM --- Run the server (this is what keeps the window busy) ---
call npm run serve
if errorlevel 1 ( popd & goto :fail )
popd
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
