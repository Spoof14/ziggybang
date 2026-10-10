import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({ OPENAI_API_KEY: "test-key" as string | undefined }));
vi.mock("~/env", () => ({ env: envMock }));

import { groundPreferences, interpretAsk, resolveAskPlace } from "./ask";
import { type AskConstraints } from "~/lib/listings/ask-picks";
import { matchPlace } from "~/lib/listings/search";

const resolvePlace = async (text: string) => matchPlace(text) ?? null;
const viewport = { lat: 37.5, lng: 127.0 };

function openAiReply(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
}

async function ask(text: string, previous?: AskConstraints) {
  return interpretAsk({ messages: [{ role: "user", content: text }], previous, viewport }, { resolvePlace });
}

describe("interpretAsk with OpenAI", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    envMock.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("strips constraints the user never stated and resolves the place to coordinates", async () => {
    fetchMock.mockResolvedValueOnce(
      openAiReply({
        searchInput: "Seoul Station",
        maxBuildingAge: 5,
        ageFilter: "month",
        areaBucketIds: ["xs"],
        viewMode: "list",
        radiusM: 800,
      }),
    );
    const r = await ask("newest buildings under 5 years old near Seoul Station");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.provider).toBe("openai");
    expect(r.constraints.ageFilter).toBeUndefined();
    expect(r.constraints.areaBucketIds).toBeUndefined();
    expect(r.constraints.maxBuildingAge).toBe(5);
    expect(r.constraints.place).toMatchObject({ kind: "place", radiusM: 800 });
    expect(r.constraints.place!.lat).toBeCloseTo(37.5547, 3);
  });

  it("does not turn 'under 200 million' into a size bucket", async () => {
    fetchMock.mockResolvedValueOnce(
      openAiReply({ searchInput: "Mapo", propertyTypes: ["villa"], salesTypes: ["jeonse"], maxDeposit: 20000, areaBucketIds: ["xs"] }),
    );
    const r = await ask("jeonse villa in Mapo under 200 million");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.areaBucketIds).toBeUndefined();
    expect(r.constraints.salesTypes).toEqual(["jeonse"]);
    expect(r.constraints.maxDeposit).toBe(20000);
  });

  it("uses the shared parser for k / 만원 amounts instead of the model's number", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ searchInput: "Hongdae", maxRent: 1, floorFilter: "no-basement" }));
    const r = await ask("cheap studio near Hongdae under 700k monthly, no basement, newer than 10 yrs");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.maxRent).toBe(70);
    expect(r.constraints.floorFilter).toBe("no-basement");
    expect(r.constraints.maxBuildingAge).toBe(10);
    expect(r.constraints.propertyTypes).toEqual(["oneroom"]);
  });

  it("turns wishes into soft preferences, never filters, and grounds them in the text", async () => {
    fetchMock.mockResolvedValueOnce(
      openAiReply({ searchInput: "Hongdae", preferences: ["quiet", "close to subway", "balcony", "pool"] }),
    );
    const r = await ask("studio near Hongdae, quiet, close to subway");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.preferences).toEqual(["quiet", "close to subway"]);
  });

  it("does not invent a building-age cap for a vague 'newer building'", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ searchInput: "Gangnam", propertyTypes: ["officetel"], maxBuildingAge: 10 }));
    const r = await ask("spacious officetel near Gangnam station, newer building, elevator");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.maxBuildingAge).toBeUndefined();
    expect(r.constraints.preferences).toEqual(expect.arrayContaining(["newer building", "elevator", "spacious"]));
  });

  it("declines off-topic messages", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ offTopic: true }));
    const r = await ask("what is the weather");
    expect(r.status).toBe("off_topic");
    if (r.status === "off_topic") expect(r.reply).toMatch(/I can only help find a rental/);
  });

  it("handles a follow-up that only adds a preference, keeping earlier constraints", async () => {
    const previous: AskConstraints = {
      place: { name: "hongdae", lat: 37.5563, lng: 126.9236, radiusM: 800, kind: "place" },
      maxRent: 70,
      propertyTypes: ["oneroom"],
    };
    fetchMock.mockResolvedValueOnce(openAiReply({ preferences: ["elevator"] }));
    const r = await ask("only with elevator", previous);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.maxRent).toBe(70);
    expect(r.constraints.place?.name).toBe("hongdae");
    expect(r.constraints.preferences).toEqual(["elevator"]);
  });

  it("makes 'cheaper' follow-ups lower the budget", async () => {
    const previous: AskConstraints = {
      place: { name: "hongdae", lat: 37.5563, lng: 126.9236, radiusM: 800, kind: "place" },
      maxRent: 70,
    };
    fetchMock.mockResolvedValueOnce(openAiReply({}));
    const r = await ask("cheaper", previous);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.maxRent!).toBeLessThan(70);
  });

  it("notes that room count is unsupported", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ searchInput: "Hongdae", propertyTypes: ["villa"] }));
    const r = await ask("2 bedroom villa near Hongdae");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.assumptions.join(" ")).toContain("Room count isn't supported yet");
  });

  it("reports rate limiting after one retry and falls back to the local parser", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { status: 429, headers: { "retry-after": "0.01" } })));
    const r = await ask("studio near Hongdae under 700000 won");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.provider).toBe("local");
    expect(r.fallbackReason).toBe("rate_limited");
    expect(r.constraints.maxRent).toBe(70);
  });

  it("reports other failures as an error fallback", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const r = await ask("studio near Hongdae");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.fallbackReason).toBe("error");
  });
});

describe("interpretAsk without OpenAI", () => {
  beforeEach(() => {
    envMock.OPENAI_API_KEY = undefined;
  });
  it("works from the grounded local parser and says AI is not configured", async () => {
    const r = await ask("cheap studio near Hongdae under 700k monthly, quiet, close to subway");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.provider).toBe("local");
    expect(r.fallbackReason).toBe("unconfigured");
    expect(r.constraints).toMatchObject({ maxRent: 70, propertyTypes: ["oneroom"] });
    expect(r.constraints.place?.name).toBe("hongdae");
    expect(r.constraints.preferences).toEqual(expect.arrayContaining(["quiet", "close to subway"]));
  });
  it("falls back to the map view when no area is given", async () => {
    const r = await ask("studio under 600k");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.place).toMatchObject({ kind: "viewport", lat: 37.5, lng: 127 });
    expect(r.assumptions.join(" ")).toMatch(/current map view/);
  });
  it("declines gibberish", async () => {
    expect((await ask("what is the meaning of life")).status).toBe("off_topic");
  });
  it("falls back to the viewport when the named place can't be located", async () => {
    const assumptions: string[] = [];
    const place = await resolveAskPlace("Zzzqx", undefined, undefined, viewport, assumptions, async () => null);
    expect(place).toMatchObject({ kind: "viewport", lat: 37.5, lng: 127 });
    expect(assumptions.join(" ")).toMatch(/couldn't locate/);
  });
});

describe("groundPreferences", () => {
  it("keeps recognised wishes only if the request mentions them", () => {
    expect(groundPreferences(["elevator", "quiet"], "studio near hongdae", [])).toEqual([]);
    expect(groundPreferences(["quiet"], "quiet studio", ["quiet"])).toEqual(["quiet"]);
    expect(groundPreferences(["near a park"], "I want to live near a park", [])).toEqual(["near a park"]);
  });
});
