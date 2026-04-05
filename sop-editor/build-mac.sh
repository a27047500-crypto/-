#!/bin/bash
echo "================================================"
echo "  流程文件编辑器 - Electron 打包脚本 (macOS)"
echo "================================================"
echo

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装："
    echo "       https://nodejs.org/  （下载 LTS 版本）"
    exit 1
fi

# 检查 index.html
if [ ! -f "index.html" ]; then
    echo "[错误] 未找到 index.html！"
    echo "       请将编辑器 HTML 文件重命名为 index.html 后重试"
    exit 1
fi

echo "[1/3] Node.js 版本：$(node -v)"
echo

echo "[2/3] 安装依赖..."
npm install || { echo "[错误] 依赖安装失败"; exit 1; }

echo
echo "[3/3] 打包 macOS 应用..."
npm run build:mac || { echo "[错误] 打包失败"; exit 1; }

echo
echo "================================================"
echo "  打包完成！输出文件位于 dist/ 文件夹"
echo "================================================"
open dist
