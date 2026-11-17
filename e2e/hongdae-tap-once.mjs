import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const outDir = "/opt/cursor/artifacts/hongdae-e2e";
mkdirSync(outDir, { recursive: true });
const base = process.env.PLAYWRIGHT_BASE_URL ?? "https://ziggybang.vercel.app";

const url = `${base}/?q=hongdae&src=naver&ok=1&pics=1&floor=2&age=30&size=s&lat=37.5563&lng=126.9236&z=17`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 5"],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  locale: "en-US",
});
const page = await context.newPage();

const net = { expand: 0 };
page.on("response", async (res) => {
  if (!res.url().includes("/api/trpc")) return;
  const text = await res.text().catch(() => "");
  if (text.includes("expandNaverGroups")) net.expand += 1;
});

console.log(url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector(".leaflet-container");
await page.waitForTimeout(16_000);

for (let z = 0; z < 2; z++) {
  const zin = page.locator(".leaflet-control-zoom-in");
  if (await zin.isEnabled()) await zin.click().catch(() => {});
  await page.waitForTimeout(800);
}

await page.waitForFunction(
  () => document.querySelectorAll(".listing-cluster-approx, .listing-cluster").length > 0,
  { timeout: 120_000 },
);

const before = await page.evaluate(() => {
  const hintTooltip = document.querySelector(".cluster-hint-tooltip");
  const leafletTips = document.querySelectorAll(".leaflet-tooltip").length;
  return {
    clusters: document.querySelectorAll(".listing-cluster").length,
    approx: document.querySelectorAll(".listing-cluster-approx").length,
    hintTooltipVisible: hintTooltip
      ? hintTooltip.getBoundingClientRect().height > 0
      : false,
    leafletTooltipCount: leafletTips,
    tooltipPanePe: getComputedStyle(document.querySelector(".leaflet-tooltip-pane")).pointerEvents,
  };
});

await page.screenshot({ path: `${outDir}/prod-hongdae-before-tap-v3.png` });

const clicked = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll(".listing-cluster-approx, .listing-cluster")];
  const target = nodes.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.top > 60 && r.bottom < window.innerHeight - 60;
  });
  if (!target) return { ok: false, reason: "no in-view bubble" };
  const r = target.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  target.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "touch" }));
  target.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, pointerType: "touch" }));
  target.dispatchEvent(new MouseEvent("click", opts));
  return { ok: true, title: target.getAttribute("title"), aria: target.querySelector("[aria-label]")?.getAttribute("aria-label") };
});

await page.waitForTimeout(2000);
const sawLoading = await page.getByText(/Loading homes|매물 불러오는 중/).isVisible().catch(() => false);
await page.waitForTimeout(14_000);

const after = await page.evaluate(() => ({
  loading: Boolean(document.querySelector(".listing-cluster-loading")),
  leafletTooltipCount: document.querySelectorAll(".leaflet-tooltip").length,
  notice: [...document.querySelectorAll('[role="status"]')]
    .map((n) => n.textContent?.trim())
    .filter((t) => t && /Loading|No homes|매물/i.test(t)),
}));

await page.screenshot({ path: `${outDir}/prod-hongdae-after-tap-v3.png` });

const report = { url, before, clicked, sawLoading, after, net };
writeFileSync(`${outDir}/tap-report-v3.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();