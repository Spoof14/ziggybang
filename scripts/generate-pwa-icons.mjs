import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "public/icons/icon.svg");
const outDir = join(root, "public/icons");
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath);

async function render(name, size, extraPad = 0) {
  const pad = extraPad;
  const inner = size - pad * 2;
  const png = await sharp(svg)
    .resize(inner, inner, { fit: "contain", background: "#020617" })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: "#020617",
    })
    .png()
    .toBuffer();
  writeFileSync(join(outDir, name), png);
}

await render("icon-192.png", 192);
await render("icon-512.png", 512);
await render("icon-maskable-512.png", 512, Math.round(512 * 0.1));
await sharp(svg).resize(180, 180, { fit: "contain", background: "#020617" }).png().toFile(join(outDir, "apple-touch-icon.png"));
await sharp(svg).resize(32, 32, { fit: "contain", background: "#020617" }).png().toFile(join(root, "public/favicon.png"));
await sharp(svg).resize(48, 48, { fit: "contain", background: "#020617" }).png().toBuffer().then((buf) => writeFileSync(join(root, "public/favicon-48.png"), buf));

console.log("PWA icons generated in public/icons");