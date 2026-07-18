@echo off
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies for the first time - this may take a minute...
    call npm install
)

start "Diamond Ledger Sim" cmd /k "npm run dev"
timeout /t 4 /nobreak >nul
start http://localhost:5173