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
  echo.
  echo ERROR: Node.js not found.
  echo Please download and install Node.js from: https://nodejs.org
  echo After installation, restart your computer and run this script again.
  echo.
  pause
  exit /b 1
)

echo [Check] npm version...
npm -v
echo.

echo [1/3] Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: npm install failed. See error above.
  echo.
  pause
  exit /b 1
)

echo.
echo [2/3] Building Windows installer...
call npm run build:win
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: Build failed. See error above.
  echo.
  pause
  exit /b 1
)

echo.
echo [3/3] Build complete!
if exist dist (
  echo Installer is in the dist\ folder.
  explorer dist
) else (
  echo NOTE: dist folder not found, check build output above.
)

echo.
pause
