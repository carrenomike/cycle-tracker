@echo off
cd /d "%~dp0"
git add index.html
git commit -m "Update dashboard"
git push
echo.
echo Done! Your site will be live in about 1 minute.
pause
