@echo off
REM Opens ParkSmart (demo mode) at http://localhost:8000. Needs Python (python.org, tick "Add to PATH").
cd /d "%~dp0web"
where py >nul 2>nul
if %errorlevel%==0 ( start "ParkSmart demo server" py -m http.server 8000 & goto open )
where python >nul 2>nul
if %errorlevel%==0 ( start "ParkSmart demo server" python -m http.server 8000 & goto open )
echo Python was not found. Install it from python.org (tick "Add Python to PATH"), or use the Docker / Java server instead.
pause
exit /b
:open
timeout /t 2 >nul
start "" http://localhost:8000
echo ParkSmart is running at http://localhost:8000  (close the server window to stop it)
pause
