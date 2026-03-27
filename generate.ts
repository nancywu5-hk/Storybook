import { config } from "dotenv";
import { writeFileSync, readFileSync, readdirSync } from "fs";
import path from "path";

config();

const API_KEY = process.env.AI_API_KEY!;
const BASE_URL = process.env.AI_BASE_URL!;
const MODEL = process.env.AI_IMAGE_MODEL!;
const BOOK_DIR = process.env.BOOK_DIR!;

export async function generateImage(
  prompt: string,
  outputPath: string,
  referenceImagePath?: string,
) {
  const url = `${BASE_URL}/v1beta/models/${MODEL}:generateContent`;
  const parts: any[] = [{ text: prompt }];

  if (referenceImagePath) {
    try {
      const b64 = readFileSync(referenceImagePath).toString("base64");
      parts.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
    } catch {
      console.log(`Warning: Could not read reference image: ${referenceImagePath}`);
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  Calling API (attempt ${attempt})...`);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`  API error ${resp.status}: ${errText.substring(0, 200)}`);
        if (attempt < 3) { await new Promise(r => setTimeout(r, 5000)); continue; }
        throw new Error(`API failed after 3 attempts`);
      }

      const data: any = await resp.json();
      const parts_resp = data.candidates?.[0]?.content?.parts;

      if (!parts_resp?.length) {
        console.error("  No parts in response:", JSON.stringify(data).substring(0, 500));
        if (attempt < 3) { await new Promise(r => setTimeout(r, 5000)); continue; }
        throw new Error("No parts in response");
      }

      for (const part of parts_resp) {
        const imgData = part.inlineData || part.inline_data;
        if (imgData) {
          const imgBuf = Buffer.from(imgData.data, "base64");
          writeFileSync(outputPath, imgBuf);
          console.log(`  Saved: ${outputPath} (${(imgBuf.length / 1024).toFixed(0)} KB)`);
          return;
        }
      }

      const partTypes = parts_resp.map((p: any) => Object.keys(p).join(","));
      console.error(`  No image data. Part types: [${partTypes.join("; ")}]`);
      if (attempt < 3) { await new Promise(r => setTimeout(r, 5000)); continue; }
      throw new Error("No image in response");
    } catch (e: any) {
      if (attempt < 3) {
        console.log(`  Retrying in 5s... (${e.message})`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        throw e;
      }
    }
  }
}

async function main() {
  const step = process.argv[2];
  if (!step || !["characters", "pages"].includes(step)) {
    console.error("Usage: npx tsx generate.ts <characters|pages>");
    console.error("  Env: BOOK_DIR=storybook/xxx-0318");
    process.exit(1);
  }

  console.log(`Book: ${BOOK_DIR} | Model: ${MODEL}`);

  if (step === "characters") {
    const prompt = readFileSync(path.join(BOOK_DIR, "characters/characters-prompt.txt"), "utf-8");
    console.log("Generating character reference sheet...");
    await generateImage(prompt, path.join(BOOK_DIR, "characters/characters.jpeg"));
    console.log("Done!");
  }

  if (step === "pages") {
    const charRef = path.join(BOOK_DIR, "characters/characters.jpeg");
    const files = readdirSync(path.join(BOOK_DIR, "prompts")).filter(f => f.endsWith(".md")).sort();

    for (const file of files) {
      const content = readFileSync(path.join(BOOK_DIR, "prompts", file), "utf-8");
      const promptText = content.split("\n").filter(l => !l.startsWith("#") && l.trim()).join("\n");
      const outputFile = file.replace(".md", ".jpeg");

      console.log(`\nGenerating ${outputFile}...`);
      await generateImage(promptText, path.join(BOOK_DIR, outputFile), charRef);
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log("\nAll pages done!");
  }
}

main().catch(console.error);
