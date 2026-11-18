@echo off
title Flowlight Windows
cd /d "%~dp0"
cls
echo ========================================================
echo   Flowlight Windows v1.0.9
echo   Starting Flowlight Downloader...
echo ========================================================
node "%~dp0node_modules\electron\cli.js" "%~dp0"
