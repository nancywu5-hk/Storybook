import asyncio
import os
import re
import subprocess
import edge_tts

BOOK_DIR = os.environ.get("BOOK_DIR", "storybook/wangwang-maomao-0318")
IMAGE_DIR = os.path.join(BOOK_DIR, "with-text")
STORYBOARD_PATH = os.path.join(BOOK_DIR, "storyboard.md")
OUTPUT_VIDEO = os.path.join(BOOK_DIR, f"{os.path.basename(BOOK_DIR)}-story.mp4")
TEMP_DIR = os.path.join(BOOK_DIR, "temp_video")

# 声音配置：晓晓 (Xiaoxiao) 是非常柔和轻盈的中性/女性儿童故事声音
VOICE = "zh-CN-XiaoxiaoNeural"

async def generate_audio(text, output_path):
    communicate = edge_tts.Communicate(text, VOICE, rate="+0%", pitch="+0Hz")
    await communicate.save(output_path)

def get_narration():
    if not os.path.exists(STORYBOARD_PATH):
        print(f"Error: {STORYBOARD_PATH} not found.")
        return []
    with open(STORYBOARD_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 匹配 ## 标题 和 **文字**: 内容
    sections = re.split(r'---', content)
    narrations = []
    
    # 封面
    cover_match = re.search(r'## 封面.*?标题\*\*: (.*?)(?=\n|$)', sections[0], re.S)
    if cover_match:
        narrations.append(("00-cover", f"《{cover_match.group(1).strip()}》"))
    
    # 各页内容
    for i in range(1, len(sections)):
        section = sections[i]
        page_match = re.search(r'## 第(\d+)页', section)
        text_match = re.search(r'\*\*文字\*\*: (.*?)(?=\n|$)', section)
        
        if page_match and text_match:
            page_num = int(page_match.group(1))
            text = text_match.group(1).strip()
            # 移除引号
            text = text.replace('"', '').replace('"', '').replace('"', '').replace('"', '')
            narrations.append((f"{page_num:02d}-page", text))
            
    return narrations

async def make_video():
    if not os.path.exists(TEMP_DIR):
        os.makedirs(TEMP_DIR)
        
    narrations = get_narration()
    if not narrations:
        return
    clip_files = []
    
    print(f"Total pages to process: {len(narrations)}")
    
    for filename_base, text in narrations:
        img_path = os.path.join(IMAGE_DIR, f"{filename_base}.jpeg")
        audio_path = os.path.join(TEMP_DIR, f"{filename_base}.mp3")
        clip_path = os.path.join(TEMP_DIR, f"{filename_base}.mp4")
        
        if not os.path.exists(img_path):
            print(f"Skipping {filename_base}, image not found.")
            continue
            
        print(f"Processing {filename_base}...")
        
        # 1. 生成语音
        await generate_audio(text, audio_path)
        
        # 2. 获取音频长度
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True
        )
        audio_duration = float(result.stdout.strip())
        duration = audio_duration + 1.5  # 留1.5秒余量
        
        # 3. 合成单页视频 (使用渐入渐出效果)
        # 缩放图片到 1080p 以保证视频质量，并添加填充确保比例一致
        fade_duration = 0.5
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", img_path,
            "-i", audio_path,
            "-c:v", "libx264", "-t", str(duration),
            "-pix_fmt", "yuv420p",
            "-vf", f"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white,fade=t=in:st=0:d={fade_duration},fade=t=out:st={duration-fade_duration}:d={fade_duration}",
            "-c:a", "aac",
            clip_path
        ]
        subprocess.run(cmd, capture_output=True)
        clip_files.append(clip_path)
        
    # 4. 合并所有片段
    if not clip_files:
        print("No clips to merge.")
        return
    concat_file = os.path.join(TEMP_DIR, "concat.txt")
    with open(concat_file, "w") as f:
        for clip in clip_files:
            f.write(f"file '{os.path.abspath(clip)}'\n")
            
    print("Merging clips into final video...")
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_file,
        "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p",
        OUTPUT_VIDEO
    ]
    subprocess.run(cmd, capture_output=True)
    
    print(f"\nSuccess! Video saved to: {OUTPUT_VIDEO}")
    
    # 清理临时文件
    # subprocess.run(["rm", "-rf", TEMP_DIR])

if __name__ == "__main__":
    asyncio.run(make_video())
