@echo off
chcp 65001 >nul
title 青眸护眼平台
cd /d "%~dp0"

echo.
echo  ==========================================
echo   青眸护眼平台 - 本地启动
echo  ==========================================
echo   正在启动后端，浏览器将在几秒后自动打开...
echo   关闭本窗口即可停止服务。
echo  ==========================================
echo.

start "" /min cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8123/"
python server\server.py
