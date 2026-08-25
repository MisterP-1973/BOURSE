@echo off
title AI Stock Analyzer - BOURSE
cd /d "%~dp0"

echo ========================================================
echo        Lancement de AI Stock Analyzer (BOURSE)
echo ========================================================
echo.

:: Verifier si l'environnement virtuel existe
if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXEC=venv\Scripts\python.exe"
) else (
    set "PYTHON_EXEC=python"
)

:: Ouvrir le navigateur automatiquement apres 2 secondes
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

echo Demarrage du serveur Flask sur http://localhost:3000 ...
echo (Fermez cette fenetre ou faites Ctrl+C pour arreter le serveur)
echo.

%PYTHON_EXEC% app.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERREUR] Le programme s'est arrete avec une erreur.
    pause
)
