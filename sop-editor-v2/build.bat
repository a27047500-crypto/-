@echo off
cd /d "%~dp0"
echo ============================================
echo  SOP Editor v2 - Build Script
echo ============================================
echo.
echo Current directory: %CD%
echo.

echo [Check] Node.js version...
node -v
if %ERRORLEVEL% neq 0 (
  echo ERROR: Node.js not found. Download from https://nodejs.org
  pause
  exit /b 1
)

echo [Check] npm version...
npm -v
echo.

echo [Config] Setting mirrors (China network)...
npm config set registry https://registry.npmmirror.com
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
echo Done.
echo.

echo [1/3] Installing dependencies (may take a few minutes)...
call npm install
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: npm install failed. See error above.
  pause
  exit /b 1
)

echo.
echo [2/3] Building Windows installer...
call npm run build:win
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: Build failed. See error above.
  pause
  exit /b 1
)

echo.
echo [3/3] Build complete!
if exist dist (
  echo Installer is in the dist\ folder.
  explorer dist
) else (
  echo NOTE: dist folder not found.
)

echo.
pause
