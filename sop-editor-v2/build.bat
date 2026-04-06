@echo off
cd /d "%~dp0"
echo ============================================
echo  流程文件编辑器 v2 — 构建脚本
echo ============================================
echo.

echo 当前目录: %CD%
echo.

echo [检查] 检测 Node.js 是否安装...
node -v
if %ERRORLEVEL% neq 0 (
  echo.
  echo *** 错误: 未检测到 Node.js ***
  echo 请先下载安装 Node.js: https://nodejs.org
  echo 安装完成后重新运行此脚本。
  echo.
  pause
  exit /b 1
)

echo [检查] 检测 npm 版本...
npm -v
echo.

echo [1/3] 安装依赖...
call npm install
if %ERRORLEVEL% neq 0 (
  echo.
  echo *** 错误: npm install 失败，请查看上方错误信息 ***
  echo.
  pause
  exit /b 1
)

echo.
echo [2/3] 构建 Windows 安装包...
call npm run build:win
if %ERRORLEVEL% neq 0 (
  echo.
  echo *** 错误: 构建失败，请查看上方错误信息 ***
  echo.
  pause
  exit /b 1
)

echo.
echo [3/3] 构建完成！
if exist dist (
  echo 安装包位于 dist\ 目录下
  explorer dist
) else (
  echo 注意: dist 目录未找到，请检查构建输出
)

echo.
echo 按任意键退出...
pause
