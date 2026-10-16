@echo off
REM Runs Tools/verify-proxy.js against the Cloudflare Worker without the tokens
REM ever being typed, pasted or stored anywhere near this repo.
REM
REM deploy.bat does `git add -A` into a PUBLIC repo, so the secrets file lives
REM OUTSIDE the repo on purpose: %USERPROFILE%\.cycle-proxy.txt, three lines, in
REM this order and nothing else --
REM
REM   <the Worker URL>
REM   <reader token>
REM   <writer token>
REM
REM (Until cf2 line 1 was the Google /exec URL and a 4th line held the sheet ID.)
REM Nothing echoes the values back. If this file ever moves inside the repo,
REM the tokens are burned the next time anyone deploys.

setlocal
cd /d "%~dp0"
set "CFG=%USERPROFILE%\.cycle-proxy.txt"

if not exist "%CFG%" (
  echo Missing "%CFG%".
  echo.
  echo Create it with three lines: the Worker URL, the reader token, the writer
  echo token. Keep it out of this repo - deploy.bat pushes everything in here
  echo to a public site.
  pause
  exit /b 1
)

set "N=0"
for /f "usebackq delims=" %%L in ("%CFG%") do (
  set /a N+=1
  call set "A%%N%%=%%L"
)
if not "%N%"=="3" (
  echo "%CFG%" has %N% line^(s^); it needs exactly 3.
  pause
  exit /b 1
)

node Tools\verify-proxy.js "%A1%" "%A2%" "%A3%"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo *** verify-proxy reported a problem - see above. ***
pause
exit /b %RC%
