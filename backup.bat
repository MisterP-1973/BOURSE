@echo off
chcp 65001 >nul
title Sauvegarde Bourse Portfolio
echo ========================================================
echo        SAUVEGARDE DU PORTEFEUILLE BOURSE ET CRYPTO
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

"%PYTHON_EXE%" scripts\backup_cli.py

echo.
pause

