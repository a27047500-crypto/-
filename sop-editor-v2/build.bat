@echo off
cd /d "%~dp0"
echo ============================================
echo  SOP Editor v2 - Build Script
echo ============================================
echo Current directory: %CD%
echo.

node -v >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo ERROR: Node.js not found. Download from https://nodejs.org
  pause & exit /b 1
)

echo Node.js OK
echo.

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo [1/3] Installing dependencies (may take several minutes)...
echo       Downloading Electron ~100MB, please wait...
echo.
call npm install --registry=https://registry.npmmirror.com
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: npm install failed.
  pause & exit /b 1
)

echo.
echo [2/3] Building Windows installer...
call npm run build:win
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: Build failed.
  pause & exit /b 1
)

echo.
echo [3/3] Done! Installer is in the dist\ folder.
if exist dist ( explorer dist )
echo.
pause
