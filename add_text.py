#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为绘本图片添加文字"""

import os
from PIL import Image, ImageDraw, ImageFont

BOOK_DIR = "storybook/wangwang-maomao-0318"

# 每页的文字内容
TEXTS = {
    "00-cover": "《汪汪狗和喵喵猫》",
    "01-page": '''"哎呀！"汪汪狗不小心撞到了喵喵猫。
"你没事吧？"汪汪狗关心地问。''',
    "02-page": '''"我没事，"喵喵猫说，"你是在追蝴蝶吗？"
"是啊！"汪汪狗开心地摇尾巴。''',
    "03-page": '''从那天起，汪汪狗和喵喵猫成了最好的朋友。
他们一起在森林里探险。''',
    "04-page": '''"我闻到蘑菇的香味了！"汪汪狗兴奋地说。
"我看到了，在大树后面！"喵喵猫指着前方。''',
    "05-page": '''可是，一条小溪挡住了他们的去路。
水太急了，怎么过去呢？''',
    "06-page": '''"我来背你过河！"汪汪狗勇敢地说。
喵喵猫跳到汪汪狗的背上，他们一起游过了小溪。''',
    "07-page": '''过河后，他们找到了好多美味的蘑菇！
"今天的收获真大！"喵喵猫开心地说。''',
    "08-page": '''"看，有一只小鸟受伤了！"喵喵猫轻轻地说。
他们决定帮助小鸟。''',
    "09-page": '''他们给小鸟包扎了翅膀，每天来照顾它。
小鸟渐渐康复了。''',
    "10-page": '''小鸟康复了，飞向蓝天。
"谢谢你，汪汪狗和喵喵猫！"小鸟在空中说。''',
    "11-page": '''"今天真是太棒了！"汪汪狗说。
喵喵猫点点头，两个好朋友靠在一起看夕阳。''',
    "12-page": '''有朋友真好，汪汪狗和喵喵猫都这么想。
明天，又会有新的冒险等着他们！''',
}

def find_chinese_font():
    """查找可用的中文字体"""
    font_paths = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
    ]
    for path in font_paths:
        if os.path.exists(path):
            return path
    return None

def wrap_text(text, font, max_width, draw):
    """自动换行文本"""
    lines = []
    for paragraph in text.split('\n'):
        words = list(paragraph)
        current_line = ""
        for word in words:
            test_line = current_line + word
            bbox = draw.textbbox((0, 0), test_line, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        if current_line:
            lines.append(current_line)
    return lines

def add_text_to_image(image_path, text, output_path):
    """在图片底部添加文字"""
    # 打开原图
    img = Image.open(image_path)
    width, height = img.size
    
    # 计算文字区域高度
    text_area_height = int(height * 0.18)  # 底部18%作为文字区域
    
    # 创建新图片（原图 + 文字区域）
    new_height = height + text_area_height
    new_img = Image.new('RGB', (width, new_height), (255, 255, 255))  # 白色背景
    new_img.paste(img, (0, 0))
    
    # 准备绘制
    draw = ImageDraw.Draw(new_img)
    
    # 查找字体
    font_path = find_chinese_font()
    font_size = int(width * 0.04)  # 根据图片宽度调整字体大小
    
    try:
        if font_path:
            font = ImageFont.truetype(font_path, font_size)
        else:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()
    
    # 文字换行处理
    max_text_width = width - 60
    lines = wrap_text(text, font, max_text_width, draw)
    
    # 计算文字位置（居中）
    line_height = font_size * 1.6
    total_text_height = len(lines) * line_height
    y_offset = height + (text_area_height - total_text_height) / 2
    
    # 绘制文字
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        text_width = bbox[2] - bbox[0]
        x = (width - text_width) / 2
        
        # 绘制阴影效果
        draw.text((x + 1, y_offset + 1), line, font=font, fill=(220, 220, 220))
        # 绘制文字
        draw.text((x, y_offset), line, font=font, fill=(50, 50, 50))
        
        y_offset += line_height
    
    # 保存图片
    new_img.save(output_path, quality=95)
    print(f"  Created: {output_path}")

def main():
    # 创建输出目录
    output_dir = os.path.join(BOOK_DIR, "with-text")
    os.makedirs(output_dir, exist_ok=True)
    
    # 处理每张图片
    for filename, text in TEXTS.items():
        image_path = os.path.join(BOOK_DIR, f"{filename}.jpeg")
        output_path = os.path.join(output_dir, f"{filename}.jpeg")
        
        if os.path.exists(image_path):
            print(f"Processing {filename}...")
            add_text_to_image(image_path, text, output_path)
        else:
            print(f"  Image not found: {image_path}")
    
    print(f"\nDone! All images saved to {output_dir}/")

if __name__ == "__main__":
    main()
