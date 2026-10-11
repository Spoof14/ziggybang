import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted((): { OPENAI_API_KEY: string | undefined } => ({ OPENAI_API_KEY: "test-key" }));
vi.mock("~/env", () => ({ env: envMock }));

import { groundPreferences, interpretAsk, resolveAskPlace } from "./ask";
import { type AskConstraints } from "~/lib/listings/ask-picks";
import { matchPlace } from "~/lib/listings/search";

const resolvePlace = async (text: string) => matchPlace(text) ?? null;
const viewport = { lat: 37.5, lng: 127.0 };

function openAiReply(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
}

async function ask(text: string, previous?: AskConstraints, forceAi = true) {
  return interpretAsk({ messages: [{ role: "user", content: text }], previous, viewport }, { resolvePlace, forceAi });
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

  it("turns a room count into a best-effort constraint, not a size or type", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ searchInput: "Hongdae", propertyTypes: ["villa"] }));
    const r = await ask("2 bedroom villa near Hongdae");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.constraints.rooms).toBe(2);
    expect(r.constraints.areaBucketIds).toBeUndefined();
  });

  it("skips the model when the deterministic parser already understood the message", async () => {
    const r = await ask("망원동 투룸 월세 80만원 이하", undefined, false);
    expect(fetchMock).not.toHaveBeenCalled();
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.fallbackReason).toBeUndefined();
    expect(r.constraints).toMatchObject({ maxRent: 80, salesTypes: ["wolse"], rooms: 2 });
    expect(r.constraints.place?.kind).toBe("place");
  });

  it("still asks the model about an area the place table doesn't know", async () => {
    fetchMock.mockResolvedValueOnce(openAiReply({ searchInput: "Yeonhui", maxRent: 50 }));
    const r = await ask("연희동 원룸 월세 50 이하", undefined, false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("ok");
  });

  describe("refine merges into the previous constraints", () => {
    const previous: AskConstraints = {
      place: { name: "망원동", lat: 37.556, lng: 126.91, radiusM: 800, kind: "place" },
      salesTypes: ["wolse"],
      maxRent: 80,
      rooms: 2,
    };
    it("keeps rent cap, deal type, room count and place for 'only newer buildings' even if the model repeats the area", async () => {
      fetchMock.mockResolvedValueOnce(openAiReply({ searchInput: "Mangwon", preferences: ["newer building"] }));
      const r = await ask("only newer buildings", previous);
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.constraints).toMatchObject({ maxRent: 80, salesTypes: ["wolse"], rooms: 2 });
      expect(r.constraints.place).toMatchObject({ name: "망원동", radiusM: 800 });
      expect(r.constraints.preferences).toEqual(["newer building"]);
    });
    it("works without the model for the same follow-up", async () => {
      const r = await ask("only newer buildings", previous, false);
      expect(fetchMock).not.toHaveBeenCalled();
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.constraints).toMatchObject({ maxRent: 80, salesTypes: ["wolse"], rooms: 2 });
      expect(r.constraints.preferences).toEqual(["newer building"]);
    });
    it("overrides only what the follow-up changes", async () => {
      const jeonse = await ask("actually jeonse", previous, false);
      if (jeonse.status !== "ok") throw new Error("expected ok");
      expect(jeonse.constraints.salesTypes).toEqual(["jeonse"]);
      expect(jeonse.constraints.rooms).toBe(2);
      expect(jeonse.constraints.place?.name).toBe("망원동");
      const cheaper = await ask("cheaper", previous, false);
      if (cheaper.status !== "ok") throw new Error("expected ok");
      expect(cheaper.constraints.maxRent!).toBeLessThan(80);
      expect(cheaper.constraints.rooms).toBe(2);
      const elevator = await ask("only with elevator", previous, false);
      if (elevator.status !== "ok") throw new Error("expected ok");
      expect(elevator.constraints.preferences).toEqual(["elevator"]);
      expect(elevator.constraints.maxRent).toBe(80);
    });
    it("only an explicit new search in another area resets everything", async () => {
      const r = await ask("find a jeonse apartment near Gangnam under 300 million", previous, false);
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.constraints.rooms).toBeUndefined();
      expect(r.constraints.maxRent).toBeUndefined();
      expect(r.constraints.maxDeposit).toBe(30000);
      expect(r.constraints.place?.lat).toBeCloseTo(37.4979, 2);
    });
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
