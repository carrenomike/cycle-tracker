@echo off
cd /d "%~dp0"

git add -A
if errorlevel 1 goto fail

git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Nothing to deploy - no changes staged.
  pause
  exit /b 0
)

echo Deploying these files:
git diff --cached --name-status
echo.

git commit -m "Update dashboard"
if errorlevel 1 goto fail

git push
if errorlevel 1 goto fail

echo.
echo Done! Your site will be live in about 1 minute.
pause
exit /b 0

:fail
echo.
echo ***************************************************
echo *** DEPLOY FAILED - the site was NOT updated    ***
echo ***************************************************
echo.
pause
exit /b 1
