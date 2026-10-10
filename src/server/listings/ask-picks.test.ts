import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({ OPENAI_API_KEY: "test-key" as string | undefined }));
vi.mock("~/env", () => ({ env: envMock }));

import { clearAskCache, computeAskPicks, runAskPicks, type CandidateFetch } from "./ask-picks";
import { type AskConstraints } from "~/lib/listings/ask-picks";
import { type MapListing } from "~/lib/listings/types";

const place = { name: "hongdae", lat: 37.5563, lng: 126.9236, radiusM: 800, kind: "place" as const };
const constraints: AskConstraints = { place, maxRent: 70, propertyTypes: ["oneroom"] };
const messages = [{ role: "user" as const, content: "cheap studio near Hongdae under 700k" }];

function homes(n: number, over: (i: number) => Partial<MapListing> = () => ({})): MapListing[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `zigbang:oneroom:${1000 + i}`,
    source: "zigbang",
    sourceId: String(1000 + i),
    lat: place.lat + (i % 7) * 0.0006,
    lng: place.lng + Math.floor(i / 7) * 0.0006,
    propertyType: "oneroom",
    salesType: "wolse",
    deposit: 1000,
    rent: 40 + (i % 25),
    areaM2: 18 + (i % 10),
    floor: "3/5",
    approveDate: `${2005 + (i % 18)}-01-01`,
    thumbnail: "https://ic.zigbang.com/x.jpg",
    url: "https://example.com",
    ...over(i),
  })) as MapListing[];
}

function openAiReply(payload: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
}

describe("computeAskPicks", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    envMock.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    clearAskCache();
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const source = (list: MapListing[]): CandidateFetch => vi.fn(async () => ({ listings: list, errors: [] }));

  it("returns 10 AI picks with reasons, dropping invented ids and topping up", async () => {
    const list = homes(40);
    fetchMock.mockResolvedValueOnce(
      openAiReply({
        summary: "Affordable studios around Hongdae.",
        assumptions: ["Noise level isn't listed."],
        picks: [
          { id: "does-not-exist", reason: "ghost" },
          ...list.slice(0, 6).map((l) => ({ id: l.id, reason: `Because ${l.sourceId}` })),
        ],
      }),
    );
    const out = await computeAskPicks({ messages, constraints }, { fetchCandidates: source(list) });
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.provider).toBe("openai");
    expect(out.fallbackReason).toBeUndefined();
    expect(out.picks).toHaveLength(10);
    const ids = new Set(list.map((l) => l.id));
    expect(out.picks.every((p) => ids.has(p.listing.id))).toBe(true);
    expect(new Set(out.picks.map((p) => p.listing.id)).size).toBe(10);
    expect(out.picks.slice(0, 6).every((p) => p.reasonSource === "ai" && p.reason.startsWith("Because"))).toBe(true);
    expect(out.picks.slice(6).every((p) => p.reasonSource === "basic" && p.reason.length > 0)).toBe(true);
    expect(out.summary).toBe("Affordable studios around Hongdae.");
    expect(out.assumptions).toContain("Noise level isn't listed.");
    // the AI only ever sees compact summaries of at most 50 candidates, never listing descriptions
    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body) as { messages: Array<{ content: string }> };
    const payload = JSON.parse(sent.messages[1]!.content) as { candidates: unknown[] };
    expect(payload.candidates.length).toBeLessThanOrEqual(50);
  });

  it("hard-filters before ranking: nothing outside the constraints reaches the AI or the user", async () => {
    const list = homes(30, (i) => (i % 3 === 0 ? { rent: 95 } : {}));
    fetchMock.mockResolvedValueOnce(openAiReply({ picks: [] }));
    const out = await computeAskPicks({ messages, constraints }, { fetchCandidates: source(list) });
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.picks.every((p) => (p.listing.rent ?? 0) <= 70)).toBe(true);
    expect(out.candidateCount).toBe(20);
  });

  it("falls back to deterministic ranking with a reason when the AI is rate limited", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { status: 429, headers: { "retry-after": "0.01" } })));
    const out = await computeAskPicks({ messages, constraints }, { fetchCandidates: source(homes(30)) });
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.provider).toBe("local");
    expect(out.fallbackReason).toBe("rate_limited");
    expect(out.picks).toHaveLength(10);
    expect(out.picks.every((p) => p.reasonSource === "basic" && p.reason.length > 3)).toBe(true);
    expect(out.picks.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("treats an AI answer with no valid ids as a failure and uses basic ranking", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ picks: [{ id: "nope", reason: "x" }] }));
    const out = await computeAskPicks({ messages, constraints }, { fetchCandidates: source(homes(30)) });
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.fallbackReason).toBe("error");
    expect(out.picks).toHaveLength(10);
  });

  it("skips the AI call when extraction already reported it unavailable", async () => {
    const out = await computeAskPicks({ messages, constraints, skipAi: "quota" }, { fetchCandidates: source(homes(30)) });
    expect(fetchMock).not.toHaveBeenCalled();
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.fallbackReason).toBe("quota");
  });

  it("works without an OpenAI key", async () => {
    envMock.OPENAI_API_KEY = undefined;
    const out = await computeAskPicks({ messages, constraints }, { fetchCandidates: source(homes(30)) });
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.fallbackReason).toBe("unconfigured");
    expect(out.picks).toHaveLength(10);
  });

  it("widens the radius once when too few candidates match", async () => {
    const near = homes(5);
    const far = homes(30, (i) => ({ id: `zigbang:oneroom:${5000 + i}`, lat: place.lat + 0.01 + i * 0.0001 }));
    const fetchCandidates: CandidateFetch = vi.fn(async (_c, radiusM) => ({
      listings: radiusM > 800 ? [...near, ...far] : near,
      errors: [],
    }));
    envMock.OPENAI_API_KEY = undefined;
    const out = await computeAskPicks({ messages, constraints }, { fetchCandidates });
    expect(fetchCandidates).toHaveBeenCalledTimes(2);
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.widened).toBe(true);
    expect(out.radiusM).toBe(1400);
    expect(out.picks).toHaveLength(10);
    expect(out.assumptions.join(" ")).toMatch(/widened the search to 1\.4 km/);
  });

  it("returns fewer than 10 when fewer exist, and an empty result with suggestions when none", async () => {
    envMock.OPENAI_API_KEY = undefined;
    const few = await computeAskPicks({ messages, constraints }, { fetchCandidates: source(homes(3)) });
    if (few.status !== "ok") throw new Error("expected ok");
    expect(few.picks).toHaveLength(3);
    const none = await computeAskPicks(
      { messages, constraints: { ...constraints, maxBuildingAge: 5 } },
      { fetchCandidates: source(homes(20, () => ({ approveDate: "1990-01-01" }))) },
    );
    expect(none.status).toBe("empty");
    if (none.status !== "empty") return;
    expect(none.suggestions.map((s) => s.action.type)).toEqual(expect.arrayContaining(["widen_budget", "remove"]));
  });

  it("reports source outages instead of pretending nothing exists", async () => {
    envMock.OPENAI_API_KEY = undefined;
    const out = await computeAskPicks(
      { messages, constraints },
      { fetchCandidates: vi.fn(async () => ({ listings: [], errors: ["zigbang: timeout"] })) },
    );
    expect(out.status).toBe("empty");
    if (out.status === "empty") {
      expect(out.sourceErrors).toContain("zigbang: timeout");
      expect(out.summary).toMatch(/couldn't reach/);
    }
  });
});

describe("runAskPicks caching", () => {
  beforeEach(() => {
    envMock.OPENAI_API_KEY = "test-key";
    clearAskCache();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("serves identical requests from memory for 60s and dedupes concurrent ones", async () => {
    const list = homes(30);
    const fetchMock = vi.fn(async () =>
      openAiReply({ picks: list.slice(0, 10).map((l) => ({ id: l.id, reason: "ok" })) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const fetchCandidates: CandidateFetch = vi.fn(async () => ({ listings: list, errors: [] }));
    let t = 1_000;
    const deps = { fetchCandidates, now: () => t };
    const [a, b] = await Promise.all([
      runAskPicks({ messages, constraints }, deps),
      runAskPicks({ messages, constraints }, deps),
    ]);
    expect(a).toBe(b);
    t += 30_000;
    const c = await runAskPicks({ messages, constraints }, deps);
    expect(c).toBe(a);
    expect(fetchCandidates).toHaveBeenCalledTimes(1);
    t += 40_000;
    await runAskPicks({ messages, constraints }, deps);
    expect(fetchCandidates).toHaveBeenCalledTimes(2);
  });

  it("does not cache AI-fallback answers (the AI may be back a second later)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const fetchCandidates: CandidateFetch = vi.fn(async () => ({ listings: homes(30), errors: [] }));
    await runAskPicks({ messages, constraints }, { fetchCandidates });
    await runAskPicks({ messages, constraints }, { fetchCandidates });
    expect(fetchCandidates).toHaveBeenCalledTimes(2);
  });
});
