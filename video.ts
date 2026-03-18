import { config } from "dotenv";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { execSync, execFileSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
config();

const BOOK_DIR = process.env.BOOK_DIR!;
const FFMPEG: string = require("@ffmpeg-installer/ffmpeg").path;

// ── Helpers ──────────────────────────────────────────────

function ff(...args: string[]): void {
  try {
    execFileSync(FFMPEG, args, { stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    const lines = (e.stderr?.toString() || "").split("\n").filter((l: string) => l.trim());
    console.error(`  FFmpeg error:\n${lines.slice(-8).join("\n")}`);
    throw e;
  }
}

function getAudioDuration(audioPath: string): number {
  try {
    const raw = execSync(
      `"${FFMPEG}" -i "${audioPath}" 2>&1 | grep Duration | awk '{print $2}' | tr -d ,`,
    ).toString().trim();
    if (!raw) return 5;
    const [h, m, s] = raw.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  } catch {
    return 5;
  }
}

function generateTTS(text: string, outputPath: string): void {
  const mp3Path = outputPath.replace(/\.\w+$/, ".mp3");
  execFileSync("python3", [
    "-m", "edge_tts",
    "--text", text,
    "--voice", "zh-CN-XiaoxiaoNeural",
    "--rate=-10%",
    "--pitch=+5Hz",
    "--write-media", mp3Path,
  ]);
  ff("-y", "-i", mp3Path, "-ar", "44100", "-ac", "1", outputPath);
  try { execSync(`rm "${mp3Path}"`); } catch {}
}

// ── Extract page texts from storyboard.md ────────────────

function extractPageTexts(storyboardPath: string): { page: string; text: string }[] {
  const content = readFileSync(storyboardPath, "utf-8");
  const results: { page: string; text: string }[] = [];

  for (const section of content.split(/^---$/m)) {
    const headerMatch = section.match(/^##\s+(.+)/m);
    if (!headerMatch) continue;
    const header = headerMatch[1].trim();

    const textMatch = section.match(/\*\*文字\*\*[：:]\s*(.+?)(?:\n- \*\*|$)/s);
    if (!textMatch) continue;

    let text = textMatch[1].trim().replace(/[""]/g, "").replace(/\n/g, " ").trim();

    let pageName: string;
    if (header.includes("封面")) {
      pageName = "00-cover";
    } else {
      const m = header.match(/第\s*(\d+)\s*页/);
      if (!m) continue;
      pageName = `${parseInt(m[1]).toString().padStart(2, "0")}-page`;
    }
    results.push({ page: pageName, text });
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const tempDir = path.resolve(BOOK_DIR, "_temp_video");
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

  console.log(`Book: ${BOOK_DIR} | FFmpeg: ${FFMPEG}\n`);

  // 1. Extract texts
  const pageTexts = extractPageTexts(path.join(BOOK_DIR, "storyboard.md"));
  console.log(`Found ${pageTexts.length} pages with text`);

  // 2. Collect images
  const imageFiles = readdirSync(BOOK_DIR)
    .filter(f => f.endsWith(".jpeg") && f !== "all-pages.jpeg" && !f.startsWith("_"))
    .sort();
  console.log(`Found ${imageFiles.length} images\n`);

  // 3. Generate TTS + video segments
  const W = 1408, H = 792;
  const segmentFiles: string[] = [];

  for (const imgFile of imageFiles) {
    const baseName = imgFile.replace(".jpeg", "");
    const pageText = pageTexts.find(pt => pt.page === baseName);
    const imgPath = path.resolve(BOOK_DIR, imgFile);
    const audioPath = path.resolve(tempDir, `${baseName}.wav`);
    const segmentPath = path.resolve(tempDir, `${baseName}.mp4`);

    if (pageText) {
      console.log(`TTS: ${baseName}`);
      generateTTS(pageText.text, audioPath);
    } else {
      console.log(`TTS: ${baseName} (silence)`);
      ff("-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "3", audioPath);
    }

    const totalDuration = getAudioDuration(audioPath) + 2.5;
    console.log(`  Segment: ${baseName} (${totalDuration.toFixed(1)}s)`);

    ff(
      "-y", "-loop", "1", "-i", imgPath, "-i", audioPath,
      "-filter_complex",
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:white,setsar=1,format=yuv420p[v];[1:a]adelay=1000|1000,apad[a]`,
      "-map", "[v]", "-map", "[a]",
      "-t", totalDuration.toFixed(2),
      "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage",
      "-pix_fmt", "yuv420p", "-r", "24",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      segmentPath,
    );

    segmentFiles.push(segmentPath);
    console.log(`  ✓ Done\n`);
  }

  // 4. Concatenate
  console.log("Concatenating...");
  const concatListPath = path.resolve(tempDir, "concat.txt");
  writeFileSync(concatListPath, segmentFiles.map(f => `file '${f}'`).join("\n"));

  const slug = path.basename(BOOK_DIR).replace(/-\d{4}$/, "");
  const outputPath = path.resolve(BOOK_DIR, `storybook-${slug}.mp4`);

  ff("-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", outputPath);

  // 5. Cleanup
  execSync(`rm -rf "${tempDir}"`);

  console.log(`\nVideo saved: ${outputPath}`);
  try {
    const info = execSync(`"${FFMPEG}" -i "${outputPath}" 2>&1 | grep -E "Duration|Video|Audio" || true`).toString().trim();
    console.log(info);
  } catch {}
}

main().catch(console.error);
