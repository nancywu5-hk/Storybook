import { config } from "dotenv";
import { writeFileSync, readFileSync, readdirSync } from "fs";
import path from "path";

config();

const API_KEY = process.env.AI_API_KEY!;
const BASE_URL = process.env.AI_BASE_URL!;
const MODEL = process.env.AI_IMAGE_MODEL!;

const BOOK_DIR = "storybook/tadpole-finds-mama-0317";

export async function generateImage(prompt: string, outputPath: string, referenceImagePath?: string) {
  const url = `${BASE_URL}/v1beta/models/${MODEL}:generateContent`;

  const parts: any[] = [{ text: prompt }];

  if (referenceImagePath) {
    try {
      const imgBuf = readFileSync(referenceImagePath);
      const b64 = imgBuf.toString("base64");
      parts.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
    } catch (e) {
      console.log(`Warning: Could not read reference image: ${referenceImagePath}`);
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: { response_modalities: ["IMAGE"] },
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
      const candidates = data.candidates;
      if (!candidates || !candidates[0]) {
        console.error("  No candidates in response");
        if (attempt < 3) { await new Promise(r => setTimeout(r, 5000)); continue; }
        throw new Error("No candidates");
      }

      for (const part of candidates[0].content.parts) {
        const imgData = part.inlineData || part.inline_data;
        if (imgData) {
          const imgBuf = Buffer.from(imgData.data, "base64");
          writeFileSync(outputPath, imgBuf);
          console.log(`  Saved: ${outputPath} (${(imgBuf.length / 1024).toFixed(0)} KB)`);
          return;
        }
      }

      // Debug: show what parts we got
      const partTypes = candidates[0].content.parts.map((p: any) => Object.keys(p).join(","));
      console.error(`  No image data in response parts. Part types: [${partTypes.join("; ")}]`);
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

  if (step === "characters") {
    console.log("Generating character reference sheet...");
    const prompt = `Create a character reference sheet for a children's picture book called 'Tadpole Finds Mama'. Show all characters on a clean white background, each labeled with their name. Style: warm, soft watercolor illustration, similar to Axel Scheffler's style, cute and round shapes, bright warm colors.

Characters to draw:
1. DOUDOU (Tadpole, protagonist): Round shiny black tadpole with big sparkling eyes with white highlights, short translucent tail, tiny curl of waterweed on head like bangs, wearing a small red scarf. Cute curious expression.
2. PAOPAO (Tadpole, best friend): Round dark gray tadpole, slightly smaller, round eyes with long eyelashes, longer tail with light blue tip, tiny yellow water lily flower on head. Gentle shy expression.
3. AUNTIE JINJIN (Goldfish): Orange-red goldfish with flowing long tail fins like gauze, sparkling scales. Cheerful expression.
4. UNCLE YUANYUAN (Crab): Reddish-brown crab with two big claws, eyes on long stalks, looks serious but kind.
5. AUNTIE HEYE (Turtle): Dark green turtle with hexagonal shell pattern, long neck, kind wrinkled eyes, small lotus leaf on back as parasol.
6. MAMA QINGQING (Frog, mother): Bright emerald green frog with white belly, big warm golden eyes, smiling, sitting on lily pad, dark green spots on back.

Layout: 6 characters arranged neatly in two rows, each labeled. White background. Consistent cute children's book art style.`;

    await generateImage(prompt, path.join(BOOK_DIR, "characters/characters.jpeg"));
    console.log("Done!");
  }

  if (step === "pages") {
    const charRef = path.join(BOOK_DIR, "characters/characters.jpeg");
    const promptsDir = path.join(BOOK_DIR, "prompts");
    const files = readdirSync(promptsDir).filter(f => f.endsWith(".md")).sort();

    for (const file of files) {
      const promptContent = readFileSync(path.join(promptsDir, file), "utf-8");
      // Extract just the prompt text (skip the markdown title line)
      const promptText = promptContent.split("\n").filter(l => !l.startsWith("#") && l.trim()).join("\n");
      const baseName = file.replace(".md", "");
      const outputFile = `${baseName}.jpeg`;

      console.log(`\nGenerating ${outputFile}...`);
      await generateImage(promptText, path.join(BOOK_DIR, outputFile), charRef);
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log("\nAll pages done!");
  }
}

main().catch(console.error);
