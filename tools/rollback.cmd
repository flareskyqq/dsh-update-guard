@echo off
chcp 65001 >nul
title Rollback dsh-update-guard
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback.ps1" %*
echo.
pause
