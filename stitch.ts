import sharp from "sharp";
import { readdirSync } from "fs";
import path from "path";

const BOOK_DIR = process.env.BOOK_DIR!;

async function main() {
  const files = readdirSync(BOOK_DIR)
    .filter(f => f.endsWith(".jpeg") && f !== "all-pages.jpeg")
    .sort();

  console.log(`Stitching ${files.length} images from ${BOOK_DIR}`);

  const images = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(BOOK_DIR, file);
      const meta = await sharp(filePath).metadata();
      return { path: filePath, width: meta.width!, height: meta.height! };
    }),
  );

  const targetWidth = Math.max(...images.map(i => i.width));
  const resizedHeights = images.map(i => Math.round((targetWidth / i.width) * i.height));
  const totalHeight = resizedHeights.reduce((a, b) => a + b, 0);

  console.log(`Canvas: ${targetWidth} x ${totalHeight}`);

  const composites: sharp.OverlayOptions[] = [];
  let yOffset = 0;

  for (let i = 0; i < images.length; i++) {
    const resizedBuf = await sharp(images[i].path)
      .resize(targetWidth, resizedHeights[i])
      .toBuffer();
    composites.push({ input: resizedBuf, top: yOffset, left: 0 });
    yOffset += resizedHeights[i];
  }

  const outputPath = path.join(BOOK_DIR, "all-pages.jpeg");

  await sharp({
    create: {
      width: targetWidth,
      height: totalHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  console.log(`Done! ${outputPath}`);
}

main().catch(console.error);
