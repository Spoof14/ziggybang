import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted((): { OPENAI_API_KEY: string | undefined; NODE_ENV: string } => ({ OPENAI_API_KEY: "test-key", NODE_ENV: "test" }));
vi.mock("~/env", () => ({ env: envMock }));
vi.mock("~/server/listings/aggregate", () => ({
  getMapData: vi.fn(),
  getListingDetail: vi.fn(),
}));

import { getMapData } from "~/server/listings/aggregate";
import { clearAskCache } from "~/server/listings/ask-picks";
import { createCaller } from "./root";
import { type MapListing } from "~/lib/listings/types";

// Homes spread around Gangnam Station (37.4979, 127.0276): i * ~330 m north.
function homes(n: number): MapListing[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `zigbang:oneroom:${i + 1}`,
    source: "zigbang",
    sourceId: String(i + 1),
    lat: 37.4979 + i * 0.003,
    lng: 127.0276,
    propertyType: "oneroom",
    salesType: "wolse",
    deposit: 1000,
    rent: 50 + i,
    areaM2: 25,
    floor: "3/5",
    approveDate: "2016-01-01",
    thumbnail: "https://ic.zigbang.com/x.jpg",
    url: "https://example.com",
  }));
}

const mapResult = (list: MapListing[]) => ({
  mode: "markers" as const,
  clusters: [],
  listings: list,
  stats: { zigbang: list.length, naver: 0, peterpan: 0, returned: list.length, truncated: false },
  errors: [],
});

describe("Ask follow-ups (OpenAI mocked)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    envMock.OPENAI_API_KEY = "test-key";
    clearAskCache();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(getMapData).mockImplementation(async (q) => mapResult(q.sources.includes("zigbang") ? homes(40) : []));
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ picks: [] }) } }] }), { status: 200 }),
    );
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("commute: 'within 20 min of Gangnam Station' filters and labels picks as approximate", async () => {
    const caller = createCaller({ headers: new Headers() });
    const out = await caller.listings.ask({
      messages: [{ role: "user", content: "studio within 20 min of Gangnam Station" }],
    });
    if (out.status !== "ok") throw new Error(`expected ok, got ${out.status}`);
    expect(out.constraints.commute).toMatchObject({ maxMin: 20 });
    expect(out.constraints.commute?.lat).toBeCloseTo(37.4979, 1);
    expect(out.picks.length).toBeGreaterThan(0);
    // every pick is within the ~4 km straight-line equivalent of 20 minutes and carries an estimate ≤ 20
    expect(out.picks.every((p) => p.commuteMin != null && p.commuteMin <= 20)).toBe(true);
    // nearest homes first
    expect(out.picks[0]!.listing.id).toBe("zigbang:oneroom:1");
    expect(out.assumptions.join(" ")).toMatch(/rough straight-line/);
  });

  it("commute chip removal re-ranks without the commute limit", async () => {
    const caller = createCaller({ headers: new Headers() });
    const first = await caller.listings.ask({ messages: [{ role: "user", content: "studio within 15 min of Gangnam" }] });
    if (first.status !== "ok") throw new Error("expected ok");
    const { commute: _gone, ...rest } = first.constraints;
    void _gone;
    const second = await caller.listings.ask({
      messages: [{ role: "user", content: "studio within 15 min of Gangnam" }],
      constraints: rest,
    });
    if (second.status !== "ok") throw new Error("expected ok");
    expect(second.constraints.commute).toBeUndefined();
    expect(second.picks.some((p) => p.commuteMin == null)).toBe(true);
  });

  it("similar to this: anchor is excluded and results share type/deal", async () => {
    const caller = createCaller({ headers: new Headers() });
    const anchor = homes(1)[0]!;
    const out = await caller.listings.ask({
      messages: [{ role: "user", content: "Similar to pick 1" }],
      constraints: {
        place: { name: "Gangnam", lat: anchor.lat, lng: anchor.lng, radiusM: 1000, kind: "place" },
        propertyTypes: ["oneroom"],
        salesTypes: ["wolse"],
        similarTo: { id: anchor.id, label: "pick 1" },
      },
    });
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.picks.map((p) => p.listing.id)).not.toContain(anchor.id);
    expect(out.picks.every((p) => p.listing.propertyType === "oneroom")).toBe(true);
    expect(out.constraints.similarTo?.id).toBe(anchor.id);
  });

  it("follow-up memory: 'the second one but cheaper' anchors on the earlier pick", async () => {
    const caller = createCaller({ headers: new Headers() });
    const first = homes(3)[1]!;
    const out = await caller.listings.ask({
      messages: [
        { role: "user", content: "studio near Gangnam Station" },
        { role: "assistant", content: "Here are 10 picks" },
        { role: "user", content: "the second one but cheaper" },
      ],
      priorPicks: [
        { rank: 1, id: "zigbang:oneroom:1", propertyType: "oneroom", salesType: "wolse", deposit: 1000, rent: 50, areaM2: 25, lat: 37.4979, lng: 127.0276, label: "Gangnam" },
        { rank: 2, id: first.id, propertyType: "oneroom", salesType: "wolse", deposit: 1000, rent: 60, areaM2: 25, lat: first.lat, lng: first.lng, label: "Gangnam" },
      ],
    });
    if (out.status !== "ok") throw new Error(`expected ok, got ${out.status}`);
    expect(out.constraints.similarTo?.id).toBe(first.id);
    expect(out.constraints.maxRent).toBeLessThan(60);
    expect(out.picks.every((p) => (p.listing.rent ?? 0) < 60)).toBe(true);
    expect(out.assumptions[0]).toMatch(/pick #2/);
  });

  it("passes lang through: Korean assumption text for a Korean request", async () => {
    const caller = createCaller({ headers: new Headers() });
    const out = await caller.listings.ask({
      messages: [{ role: "user", content: "강남역까지 20분 이내 원룸" }],
      lang: "ko",
    });
    if (out.status !== "ok") throw new Error(`expected ok, got ${out.status}`);
    expect(out.constraints.commute?.maxMin).toBe(20);
    expect(out.assumptions.join(" ")).toMatch(/[가-힣]/);
  });
});
