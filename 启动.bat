@echo off
chcp 65001 >nul
title 流光下载 - Windows 纯净专业版
cd /d "%~dp0"
echo ========================================================
echo   流光下载 Windows 纯净专业版 v1.0.9
echo ========================================================
echo 正在启动桌面端...
node "%~dp0node_modules\electron\cli.js" "%~dp0"
