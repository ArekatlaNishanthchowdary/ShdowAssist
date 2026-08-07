@echo off
title ShadowAssist (Debug Terminal)
cd /d "%~dp0"

echo ===================================================
echo   Starting ShadowAssist in Debug Mode
echo ===================================================
echo.

npm start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Process exited with error code %ERRORLEVEL%
    echo Check the error messages above.
    echo.
    pause
)
