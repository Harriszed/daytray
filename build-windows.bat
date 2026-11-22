@echo off
setlocal
echo ============================================
echo   Building Daytray Windows Installer (.exe)
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed. Download LTS from https://nodejs.org/
  pause
  exit /b 1
)

where cargo >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Rust/Cargo is not installed. Download from https://rustup.rs/
  pause
  exit /b 1
)

echo [1/3] Running unit tests...
call npm test
if %errorlevel% neq 0 (
  echo [ERROR] Unit tests failed. Aborting build.
  pause
  exit /b 1
)

echo [2/3] Installing Tauri CLI dependencies...
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo [3/3] Compiling Daytray installer...
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Build complete! Installers generated at:
echo   src-tauri\target\release\bundle\nsis\
echo   src-tauri\target\release\bundle\msi\
echo ============================================
explorer "src-tauri\target\release\bundle\nsis"
pause
