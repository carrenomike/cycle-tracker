@echo off
cd /d "%~dp0"

REM Nothing goes to the phone that has not passed the offline checks. A broken
REM safety engine deploys just as smoothly as a working one otherwise.
call checks.bat
if errorlevel 1 goto checksfail

git add -A
if errorlevel 1 goto fail

git diff --cached --quiet
if not errorlevel 1 goto nofiles

echo Deploying these files:
git diff --cached --name-status
echo.

git commit -m "Update dashboard"
if errorlevel 1 goto fail
goto push

:nofiles
REM No edited files is NOT the same as nothing to deploy: work committed in an
REM earlier session can still be sitting here unpushed. This used to stop here
REM and report success while the live site stayed on an old version.
echo No edited files - checking for anything already committed but not sent.
echo.

:push
git push
if errorlevel 1 goto fail

echo.
echo Done! Your site will be live in about 1 minute.
echo If the page looks unchanged, close the tab and reopen it - your phone
echo may be showing you a saved copy of the old version.
pause
exit /b 0

:checksfail
echo.
echo ***************************************************
echo *** CHECKS FAILED - nothing was committed or    ***
echo *** pushed. Fix the above, then run this again. ***
echo ***************************************************
echo.
pause
exit /b 1

:fail
echo.
echo ***************************************************
echo *** DEPLOY FAILED - the site was NOT updated    ***
echo ***************************************************
echo.
pause
exit /b 1
