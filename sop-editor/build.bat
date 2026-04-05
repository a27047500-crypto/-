@echo off
:: 关键修复：强制切换到 bat 文件所在的目录
cd /d "%~dp0"
chcp 65001 >nul
echo ================================================
echo   流程文件编辑器 - Electron 打包脚本
echo   当前目录：%CD%
echo ================================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装：
    echo        https://nodejs.org/  （下载 LTS 版本）
    pause
    exit /b 1
)

:: 检查 npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 npm，请重新安装 Node.js
    pause
    exit /b 1
)

echo [1/4] 检测到 Node.js：
node -v
echo.

:: 检查 index.html 是否存在
if not exist "index.html" (
    echo [错误] 未找到 index.html！
    echo        请将您的编辑器 HTML 文件重命名为 index.html
    echo        并放到本脚本同目录下。
    pause
    exit /b 1
)

echo [2/4] 正在安装依赖（首次约需 3-5 分钟，请耐心等待）...
call npm install
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败，请检查网络连接后重试
    pause
    exit /b 1
)

echo.
echo [3/4] 正在打包 Windows 安装包...
call npm run build:win
if %errorlevel% neq 0 (
    echo [错误] 打包失败，请查看上方错误信息
    pause
    exit /b 1
)

echo.
echo [4/4] 打包完成！
echo.
echo ================================================
echo   输出文件位于：dist\ 文件夹
echo   - 安装版：*Setup*.exe   （推荐，可安装到开始菜单）
echo   - 便携版：*Portable*.exe（无需安装，直接运行）
echo ================================================
echo.
if exist dist (
    explorer dist
) else (
    echo [提示] dist 文件夹未生成，请查看上方错误信息
)
pause
