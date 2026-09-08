@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 LTS antes de abrir el dashboard.
  echo https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo Instalando dependencias del dashboard...
  call npm install --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist "dist\index.html" (
  echo Preparando la aplicacion...
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node scripts/launch.mjs
if errorlevel 1 pause
