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

REM --- Build first so the server starts instantly afterwards ---
echo Preparing the app (rebuilding) ...
call npm run build
if errorlevel 1 ( popd & goto :fail )

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
