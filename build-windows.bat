@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================================
echo   MotionTools SVGA Pro - Windows (.exe) Auto Builder
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed!
  echo Please install Node.js LTS from: https://nodejs.org/
  pause
  exit /b 1
)

echo [1/4] Installing project dependencies...
call npm install --legacy-peer-deps
if errorlevel 1 (
  echo [ERROR] npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo [2/4] Ensuring Electron and Electron-Builder are installed...
if not exist "node_modules\electron" (
  call npm install -D electron electron-builder --legacy-peer-deps
  if errorlevel 1 (
    echo [ERROR] Failed to install electron / electron-builder.
    pause
    exit /b 1
  )
)

echo.
echo [3/4] Building production web bundle (dist/)...
call npm run build
if errorlevel 1 (
  echo [ERROR] Vite build failed.
  pause
  exit /b 1
)

echo.
echo [4/4] Packaging Windows Installer (.exe) + Portable (.exe)...
call npx electron-builder --win --config electron-builder.yml
if errorlevel 1 (
  echo [ERROR] electron-builder failed.
  pause
  exit /b 1
)

echo.
echo ========================================================
echo   SUCCESS! Your Windows installers are ready inside:
echo   %cd%\release
echo ========================================================
explorer "%cd%\release"
pause
