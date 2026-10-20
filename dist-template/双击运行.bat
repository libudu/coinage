@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Coinage
"%~dp0runtime\node.exe" "%~dp0server\index.mjs"
if errorlevel 1 pause
