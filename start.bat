@echo off
setlocal enabledelayedexpansion
cd /d "C:\Project\WebStormProject\leafletproject\ReactLeaflet"

REM Убить всё, что слушает порт 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo Killing PID %%a on port 3000...
  taskkill /PID %%a /F >nul 2>&1
)

REM Убить всё, что слушает порт 4000 (если хочешь так же для сервера)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr "LISTENING"') do (
  echo Killing PID %%a on port 4000...
  taskkill /PID %%a /F >nul 2>&1
)

npm run dev