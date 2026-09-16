@echo off
REM Runs every offline self-check in Tools\. No network, no tokens - these read
REM the real code out of index.html and Tools\verify-proxy.js and run it, so a
REM change to the app cannot quietly pass a check written against old code.
REM
REM deploy.bat runs this first and refuses to push if anything fails. The live
REM network check is separate and is verify.bat.

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "BAD="
for %%F in (Tools\*-selfcheck.js) do (
  echo ============================================================
  echo %%~nxF
  echo ============================================================
  node "%%F"
  if errorlevel 1 set "BAD=!BAD! %%~nxF"
  echo.
)

if defined BAD (
  echo ***************************************************
  echo *** FAILED:!BAD!
  echo ***************************************************
  exit /b 1
)
echo All checks passed.
exit /b 0
