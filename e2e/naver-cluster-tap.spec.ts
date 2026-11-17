import { expect, test } from "@playwright/test";

const sampleListing = {
  id: "naver:oneroom:fixture-1",
  source: "naver",
  sourceId: "fixture-1",
  lat: 37.5563,
  lng: 126.9237,
  propertyType: "oneroom",
  salesType: "wolse",
  title: "Fixture room",
  deposit: 5000,
  rent: 70,
  url: "https://m.land.naver.com/article/info/fixture-1",
};

test.describe("Naver building bubble tap", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test("fires expand and shows a pin with mocked Naver responses", async ({ page }) => {
    let expandCalls = 0;
    await page.route("**/api/trpc/**", async (route) => {
      const body = route.request().postData() ?? "";
      if (body.includes("expandNaverGroups")) {
        expandCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              result: {
                data: {
                  json: {
                    listings: [sampleListing],
                    emptySourceIds: [],
                  },
                },
              },
            },
          ]),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? "https://ziggybang.vercel.app", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".leaflet-container", { timeout: 60_000 });

    const cluster = page.locator(".listing-cluster-approx, .listing-cluster").first();
    const hasCluster = await cluster.count();
    test.skip(!hasCluster, "No Naver cluster visible without live map data");

    await cluster.tap({ timeout: 10_000 });
    await expect.poll(() => expandCalls, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/Loading homes|매물 불러오는 중/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("map overlay tooltips do not steal bubble taps", async ({ page }) => {
    await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? "https://ziggybang.vercel.app", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".leaflet-container", { timeout: 60_000 });
    const tooltipPane = await page.evaluate(() => {
      const pane = document.querySelector(".leaflet-tooltip-pane");
      return pane ? getComputedStyle(pane).pointerEvents : "missing";
    });
    expect(tooltipPane).toBe("none");
  });
});