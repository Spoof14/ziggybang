import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const outDir = "/opt/cursor/artifacts/hongdae-e2e";
mkdirSync(outDir, { recursive: true });
const base = process.env.PLAYWRIGHT_BASE_URL ?? "https://ziggybang.vercel.app";

// No manual radius (r/rlat/rlng): only place-search circle from q=hongdae — Lars's scenario.
const url = `${base}/?q=hongdae&src=naver&ok=1&pics=1&floor=2&age=30&size=s&lat=37.5563&lng=126.9236&z=17`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  ...devices["Pixel 5"],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

const net = { expand: 0, trpc: [] };
page.on("response", async (res) => {
  const u = res.url();
  if (!u.includes("/api/trpc")) return;
  net.trpc.push(res.status());
  const buf = await res.body().catch(() => Buffer.alloc(0));
  const text = buf.toString("utf8");
  if (text.includes("expandNaverGroups")) net.expand += 1;
});

console.log(url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector(".leaflet-container");
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(2500);
  const n = await page.locator(".listing-cluster-approx, .listing-cluster").count();
  if (n > 0) break;
  if (i === 8) {
    const zin = page.locator(".leaflet-control-zoom-in");
    if (await zin.isEnabled()) await zin.click().catch(() => {});
  }
}

const bubble = page.locator(".listing-cluster-approx, .listing-cluster").first();
await bubble.waitFor({ state: "attached", timeout: 180_000 });
await page.waitForTimeout(2000);

const before = await page.evaluate(() => ({
  clusters: document.querySelectorAll(".listing-cluster").length,
  approx: document.querySelectorAll(".listing-cluster-approx").length,
  sampleTitle: document.querySelector(".listing-cluster-approx")?.getAttribute("title"),
  tooltipPe: getComputedStyle(document.querySelector(".leaflet-tooltip-pane")).pointerEvents,
  circlePe:
    [...document.querySelectorAll(".leaflet-overlay-pane svg path")].find((p) =>
      p.getAttribute("stroke")?.includes("38bdf8"),
    )?.getAttribute("pointer-events") ?? "none",
  filters: document.querySelector("[data-filter-toggle] span")?.textContent,
}));

await page.screenshot({ path: `${outDir}/prod-hongdae-before-tap.png` });

const box = await bubble.boundingBox();
let clickResult = { clicked: false };
if (box) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  clickResult = {
    clicked: true,
    title: await bubble.getAttribute("title"),
    at: { x, y },
  };
}

  await page.waitForTimeout(1500);
  const sawLoading = await page.locator("text=/Loading homes|매물 불러오는 중/").isVisible().catch(() => false);
  await page.waitForTimeout(16_000);

const after = await page.evaluate(() => ({
  loading: Boolean(document.querySelector(".listing-cluster-loading")),
  clusters: document.querySelectorAll(".listing-cluster").length,
  listingPins: document.querySelectorAll(
    ".leaflet-marker-pane .leaflet-interactive:not(.listing-cluster)",
  ).length,
  notice: [...document.querySelectorAll('[role="status"]')]
    .map((n) => n.textContent?.trim())
    .filter(Boolean),
  selected: Boolean(document.querySelector("[data-detail-panel], .listing-detail, aside")),
}));

await page.screenshot({ path: `${outDir}/prod-hongdae-after-tap.png` });

const report = { url, before, clickResult, sawLoading, after, net };
writeFileSync(`${outDir}/tap-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();