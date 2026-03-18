import base64
import os
import sys
from dotenv import load_dotenv
from volcengine.visual.VisualService import VisualService

# 加载 .env 文件
load_dotenv()

# 配置
AK = os.environ.get("VOLC_AK", "")
SK = os.environ.get("VOLC_SK", "")
MODEL_VERSION = os.environ.get("VOLC_MODEL_VERSION", "general_v2.0_L")
REQ_KEY = os.environ.get("VOLC_REQ_KEY", "high_aes_general_v20_L")

BOOK_DIR = "storybook/wangwang-maomao-0318"


def generate_image(prompt: str, output_path: str):
    """使用火山引擎智能绘图 API 生成图片"""
    visual_service = VisualService()
    visual_service.set_ak(AK)
    visual_service.set_sk(SK)

    form = {
        "req_key": REQ_KEY,
        "prompt": prompt.strip(),
    }
    if MODEL_VERSION:
        form["model_version"] = MODEL_VERSION

    for attempt in range(1, 4):
        try:
            print(f"  Calling API (attempt {attempt})...")
            resp = visual_service.high_aes_smart_drawing(form)

            if "data" not in resp or "binary_data_base64" not in resp["data"]:
                print(f"  No image data in response: {resp}")
                if attempt < 3:
                    continue
                raise Exception("No image data in response")

            img_data = resp["data"]["binary_data_base64"][0]
            img_bytes = base64.b64decode(img_data)

            # 确保输出目录存在
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            with open(output_path, "wb") as f:
                f.write(img_bytes)

            print(f"  Saved: {output_path} ({len(img_bytes) / 1024:.0f} KB)")
            return

        except Exception as e:
            print(f"  Error: {e}")
            if attempt < 3:
                print("  Retrying in 5s...")
                import time
                time.sleep(5)
            else:
                raise


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate.py <characters|pages>")
        sys.exit(1)

    step = sys.argv[1]

    if step == "characters":
        print("Generating character reference sheet...")
        prompt = """Create a character reference sheet for a children's picture book called 'Tadpole Finds Mama'. Show all characters on a clean white background, each labeled with their name. Style: warm, soft watercolor illustration, similar to Axel Scheffler's style, cute and round shapes, bright warm colors.

Characters to draw:
1. DOUDOU (Tadpole, protagonist): Round shiny black tadpole with big sparkling eyes with white highlights, short translucent tail, tiny curl of waterweed on head like bangs, wearing a small red scarf. Cute curious expression.
2. PAOPAO (Tadpole, best friend): Round dark gray tadpole, slightly smaller, round eyes with long eyelashes, longer tail with light blue tip, tiny yellow water lily flower on head. Gentle shy expression.
3. AUNTIE JINJIN (Goldfish): Orange-red goldfish with flowing long tail fins like gauze, sparkling scales. Cheerful expression.
4. UNCLE YUANYUAN (Crab): Reddish-brown crab with two big claws, eyes on long stalks, looks serious but kind.
5. AUNTIE HEYE (Turtle): Dark green turtle with hexagonal shell pattern, long neck, kind wrinkled eyes, small lotus leaf on back as parasol.
6. MAMA QINGQING (Frog, mother): Bright emerald green frog with white belly, big warm golden eyes, smiling, sitting on lily pad, dark green spots on back.

Layout: 6 characters arranged neatly in two rows, each labeled. White background. Consistent cute children's book art style."""

        generate_image(prompt, os.path.join(BOOK_DIR, "characters/characters.jpeg"))
        print("Done!")

    elif step == "pages":
        prompts_dir = os.path.join(BOOK_DIR, "prompts")
        files = sorted([f for f in os.listdir(prompts_dir) if f.endswith(".md")])

        for file in files:
            with open(os.path.join(prompts_dir, file), "r") as f:
                content = f.read()

            # 跳过 markdown 标题行
            prompt_text = "\n".join([l for l in content.split("\n") if not l.startswith("#") and l.strip()])
            base_name = file.replace(".md", "")
            output_file = f"{base_name}.jpeg"

            print(f"\nGenerating {output_file}...")
            generate_image(prompt_text, os.path.join(BOOK_DIR, output_file))

            import time
            time.sleep(2)

        print("\nAll pages done!")


if __name__ == "__main__":
    main()
