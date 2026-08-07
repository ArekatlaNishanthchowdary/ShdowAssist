@echo off
set PATH=%APPDATA%\npm;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%USERPROFILE%\AppData\Local\Programs\node;%PATH%
cd /d "%~dp0.."
npm start
