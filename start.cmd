@echo off
REM ============================================================
REM  一键启动本地服务器（双击本文件即可）
REM  站点地址：http://localhost:5173
REM  停止服务：在本窗口按 Ctrl + C
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 没有找到 Node.js。
  echo   请先安装 Node.js 18 或更高版本：https://nodejs.org/
  echo   安装后重新双击本文件即可。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动 FISH 鱼の灵庙 本地服务器...
echo   启动后请用浏览器打开：http://localhost:5173
echo   停止服务：在本窗口按 Ctrl + C
echo.

node server.mjs %1
pause
