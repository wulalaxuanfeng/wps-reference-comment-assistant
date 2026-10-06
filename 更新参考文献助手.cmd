@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" -InstallOnly
if errorlevel 1 goto done
node "%~dp0scripts\reload-addon.cjs"
echo.
echo 生成结果弹窗显示 v0.1.2 即为新版；重新打开 WPS 后功能组下方也会显示版本。
:done
pause
