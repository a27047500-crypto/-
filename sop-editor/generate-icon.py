"""
生成默认图标（如果您有自定义图标可跳过此脚本）
需要安装 Pillow: pip install Pillow
运行: python generate-icon.py
"""
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    sys.exit(1)

import os

def create_icon(size, filename):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 背景圆角矩形（蓝色）
    margin = size // 10
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 6,
        fill='#2563eb'
    )

    # 文字 "SOP"
    text = "SOP"
    font_size = size // 3
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2
    y = (size - text_h) // 2

    draw.text((x, y), text, fill='white', font=font)

    img.save(filename)
    print(f"已生成：{filename}")

os.makedirs('build', exist_ok=True)

# 生成 PNG（Linux / 通用预览用）
create_icon(512, 'build/icon.png')
create_icon(256, 'build/icon-256.png')

# 生成 ICO（Windows）
img_512 = Image.open('build/icon.png')
img_512.save('build/icon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("已生成：build/icon.ico")

# macOS ICNS 需要额外工具，先用 PNG 替代
import shutil
shutil.copy('build/icon.png', 'build/icon.icns')
print("已生成：build/icon.icns（macOS 占位，如需正式版请使用 iconutil）")

print("\n图标生成完成！现在可以运行 build.bat 打包了。")
