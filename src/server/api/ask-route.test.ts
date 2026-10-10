import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({ OPENAI_API_KEY: "test-key" as string | undefined, NODE_ENV: "test" }));
vi.mock("~/env", () => ({ env: envMock }));
vi.mock("~/server/listings/aggregate", () => ({
  getMapData: vi.fn(),
  getListingDetail: vi.fn(),
}));

import { getMapData } from "~/server/listings/aggregate";
import { clearAskCache } from "~/server/listings/ask-picks";
import { createCaller } from "./root";
import { type MapListing } from "~/lib/listings/types";

function listings(n: number): MapListing[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `zigbang:oneroom:${i + 1}`,
    source: "zigbang",
    sourceId: String(i + 1),
    lat: 37.5563 + (i % 6) * 0.0006,
    lng: 126.9236 + Math.floor(i / 6) * 0.0006,
    propertyType: "oneroom",
    salesType: "wolse",
    deposit: 1000,
    rent: 40 + i,
    areaM2: 20,
    floor: "3/5",
    approveDate: "2016-01-01",
    thumbnail: "https://ic.zigbang.com/x.jpg",
    url: "https://example.com",
  })) as MapListing[];
}

const mapResult = (list: MapListing[]) => ({
  mode: "markers" as const,
  clusters: [],
  listings: list,
  stats: { zigbang: list.length, naver: 0, peterpan: 0, returned: list.length, truncated: false },
  errors: [],
});

describe("listings.ask route (OpenAI mocked)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    envMock.OPENAI_API_KEY = "test-key";
    clearAskCache();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(getMapData).mockImplementation(async (q) => mapResult(q.sources.includes("zigbang") ? listings(30) : []));
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const reply = (payload: unknown) =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });

  it("interprets, searches live sources for the resolved area, and returns 10 validated picks", async () => {
    // The deterministic parser understands this request, so the only model call is the ranking.
    fetchMock
      .mockResolvedValueOnce(
        reply({
          picks: [
            ...listings(30).slice(0, 10).reverse().map((l) => ({ id: l.id, reason: `Rent ₩${l.rent}만` })),
            { id: "zigbang:oneroom:9999", reason: "invented" },
          ],
        }),
      );
    const caller = createCaller({ headers: new Headers() });
    const out = await caller.listings.ask({
      messages: [{ role: "user", content: "cheap studio near Hongdae under 700k monthly, quiet, close to subway" }],
    });
    if (out.status !== "ok") throw new Error(`expected ok, got ${out.status}`);
    expect(out.provider).toBe("openai");
    expect(out.picks).toHaveLength(10);
    expect(out.picks.every((p) => /^zigbang:oneroom:([1-9]|[12]\d|30)$/.test(p.listing.id))).toBe(true);
    expect(out.picks.every((p) => p.reason.length > 0)).toBe(true);
    // "cheap" requests keep our rent+deposit order rather than the model's: the cheapest home leads.
    expect(out.picks[0]!.listing.id).toBe("zigbang:oneroom:1");
    expect(out.constraints.maxRent).toBe(70);
    expect(out.constraints.preferences).toEqual(expect.arrayContaining(["quiet", "close to subway"]));
    // The area was resolved from the place table and fetched per live source.
    const calls = vi.mocked(getMapData).mock.calls.map(([q]) => q);
    expect(calls.map((q) => q.sources[0]).sort()).toEqual(["naver", "peterpan", "zigbang"]);
    expect(calls[0]!.circle).toMatchObject({ radiusM: 800 });
    expect(calls[0]!.maxRent).toBe(70);
  });

  it("re-ranks edited constraints without re-interpreting (chip removal)", async () => {
    fetchMock.mockResolvedValue(reply({ picks: [] }));
    const caller = createCaller({ headers: new Headers() });
    const out = await caller.listings.ask({
      messages: [{ role: "user", content: "studio near Hongdae" }],
      constraints: { place: { name: "hongdae", lat: 37.5563, lng: 126.9236, radiusM: 800, kind: "place" } },
    });
    expect(out.status).toBe("ok");
    // exactly one OpenAI call (ranking), none for interpretation
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("declines off-topic requests politely without fetching listings", async () => {
    fetchMock.mockResolvedValueOnce(reply({ offTopic: true }));
    const caller = createCaller({ headers: new Headers() });
    const out = await caller.listings.ask({ messages: [{ role: "user", content: "what's the weather in Seoul" }] });
    expect(out).toMatchObject({ status: "off_topic" });
    expect(getMapData).not.toHaveBeenCalled();
  });

  it("falls back to the on-site ranking when OpenAI is not configured", async () => {
    envMock.OPENAI_API_KEY = undefined;
    const caller = createCaller({ headers: new Headers() });
    const out = await caller.listings.ask({
      messages: [{ role: "user", content: "studio near Hongdae under 700k monthly" }],
    });
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.fallbackReason).toBe("unconfigured");
    expect(out.picks).toHaveLength(10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed input", async () => {
    const caller = createCaller({ headers: new Headers() });
    await expect(caller.listings.ask({ messages: [] })).rejects.toThrow();
    await expect(
      caller.listings.ask({
        messages: [{ role: "user", content: "x" }],
        constraints: { place: { name: "x", lat: 0, lng: 0, radiusM: 800, kind: "place" } },
      }),
    ).rejects.toThrow();
  });
});
