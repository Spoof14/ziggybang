import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: { OPENAI_API_KEY: "test-key" } }));

import { askListings } from "./ask";
import { type SearchSnapshot } from "~/lib/listings/ai-search";

const current: SearchSnapshot = {
  searchInput: "hongdae",
  propertyTypes: ["villa"],
  salesTypes: ["wolse"],
  areaBucketIds: [],
  radiusM: 800,
  viewMode: "map",
  maxRent: 70,
};

function openAiReply(payload: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    { status: 200 },
  );
}

describe("askListings with OpenAI", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("strips filters the user never stated", async () => {
    fetchMock.mockResolvedValueOnce(
      openAiReply({
        searchInput: "Seoul Station",
        maxBuildingAge: 5,
        ageFilter: "month",
        viewMode: "list",
        areaBucketIds: ["xs"],
        radiusM: 800,
      }),
    );
    const result = await askListings(
      [{ role: "user", content: "newest buildings under 5 years old near Seoul Station" }],
      current,
    );
    expect(result.provider).toBe("openai");
    expect(result.snapshot.ageFilter).toBeUndefined();
    expect(result.snapshot.areaBucketIds).toEqual([]);
    expect(result.snapshot.viewMode).toBe("map");
    expect(result.snapshot.maxBuildingAge).toBe(5);
    expect(result.snapshot.searchInput.toLowerCase()).toContain("seoul station");
  });

  it("does not turn 'under 200 million' into a size bucket", async () => {
    fetchMock.mockResolvedValueOnce(
      openAiReply({
        searchInput: "Mapo",
        propertyTypes: ["villa"],
        salesTypes: ["jeonse"],
        maxDeposit: 20000,
        areaBucketIds: ["xs"],
      }),
    );
    const result = await askListings(
      [{ role: "user", content: "jeonse villa in Mapo under 200 million" }],
      current,
    );
    expect(result.snapshot.areaBucketIds).toEqual([]);
    expect(result.snapshot.salesTypes).toEqual(["jeonse"]);
    expect(result.snapshot.maxDeposit).toBe(20000);
  });

  it("uses the shared parser for k / 만원 amounts instead of the model's number", async () => {
    fetchMock.mockResolvedValueOnce(
      openAiReply({ searchInput: "Hongdae", maxRent: 1, floorFilter: "no-basement" }),
    );
    const result = await askListings(
      [{ role: "user", content: "rent max 600k near Hongdae, no basement, newer than 10 yrs" }],
      current,
    );
    expect(result.snapshot.maxRent).toBe(60);
    expect(result.snapshot.floorFilter).toBe("no-basement");
    expect(result.snapshot.maxBuildingAge).toBe(10);
    expect(result.snapshot.searchInput).toBe("Hongdae");
  });

  it("leaves everything alone for off-topic messages", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ offTopic: true, viewMode: "list" }));
    const result = await askListings(
      [{ role: "user", content: "what is the weather" }],
      current,
    );
    expect(result.noIntent).toBe(true);
    expect(result.snapshot).toEqual(current);
    expect(result.reply).toMatch(/I can only help with finding rentals/);
  });

  it("notes that room count is unsupported", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ searchInput: "Hongdae", propertyTypes: ["villa"] }));
    const result = await askListings(
      [{ role: "user", content: "2 bedroom villa near Hongdae" }],
      current,
    );
    expect(result.reply).toContain("Room count isn't supported yet");
  });

  it("reports rate limiting after one retry and falls back to on-site search", async () => {
    fetchMock.mockImplementation(
      () => Promise.resolve(new Response("{}", { status: 429, headers: { "retry-after": "0.01" } })),
    );
    const result = await askListings(
      [{ role: "user", content: "studio near Hongdae under 700000 won" }],
      current,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe("local");
    expect(result.fallbackReason).toBe("rate_limited");
  });

  it("reports other failures as an error fallback", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const result = await askListings(
      [{ role: "user", content: "studio near Hongdae" }],
      current,
    );
    expect(result.fallbackReason).toBe("error");
  });
});
