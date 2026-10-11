import { describe, expect, it } from "vitest";
import {
  assemblePicks,
  compactCandidate,
  fallbackRank,
  localizeBasic,
  roomMatch,
  type AskConstraints,
  type AskPicksResult,
} from "./ask-picks";
import { medianOf, moneyMentions, priceText, reasonPriceConsistent, relocalizeAssumption } from "./ask-reason";
import { t } from "~/lib/i18n";
import { type MapListing } from "./types";

const place = { name: "gangnam", lat: 37.4979, lng: 127.0276, radiusM: 1500, kind: "place" as const };
const c: AskConstraints = { place };

function home(over: Partial<MapListing> = {}): MapListing {
  return {
    id: "zigbang:oneroom:1",
    source: "zigbang",
    sourceId: "1",
    lat: place.lat + 0.001,
    lng: place.lng,
    propertyType: "oneroom",
    salesType: "wolse",
    deposit: 3000,
    rent: 40,
    areaM2: 22,
    floor: "3/5",
    url: "https://example.com",
    ...over,
  };
}
const jeonse = home({ id: "z:2", salesType: "jeonse", deposit: 11000, rent: undefined });

describe("priceText", () => {
  it("states deal type and amounts per language", () => {
    expect(priceText(home(), "ko")).toBe("월세 보증금 3,000만원 / 월 40만원");
    expect(priceText(jeonse, "ko")).toBe("전세 1억 1,000만원");
    expect(priceText(home(), "en")).toMatch(/^Monthly rent: ₩30 million deposit \/ ₩400,000 per month$/);
    expect(priceText(jeonse, "en")).toBe("Jeonse ₩110 million");
  });
});

describe("reasonPriceConsistent", () => {
  it("rejects 전세 for a monthly listing (the production bug)", () => {
    expect(reasonPriceConsistent("강남역에서 350m · 전세 3,000만원", home())).toBe(false);
    expect(reasonPriceConsistent("전세 1억 1,000만원", home({ deposit: 1000 }))).toBe(false);
    expect(reasonPriceConsistent("Jeonse of ₩30 million near the station", home())).toBe(false);
  });
  it("accepts matching monthly wording and amounts", () => {
    expect(reasonPriceConsistent("강남역에서 350m · 월세 보증금 3,000만원 / 월 40만원", home())).toBe(true);
    expect(reasonPriceConsistent("₩30 million deposit, ₩400,000/mo", home())).toBe(true);
    expect(reasonPriceConsistent("보증금 3천만원에 월 40만원", home())).toBe(true);
  });
  it("rejects amounts that are not the listing's or sit in the wrong role", () => {
    expect(reasonPriceConsistent("월 55만원", home())).toBe(false);
    expect(reasonPriceConsistent("월 3,000만원", home())).toBe(false);
    expect(reasonPriceConsistent("보증금 40만원", home())).toBe(false);
    expect(reasonPriceConsistent("₩55 million deposit", home())).toBe(false);
  });
  it("jeonse: no monthly rent wording, deposit must match", () => {
    expect(reasonPriceConsistent("전세 1억 1,000만원", jeonse)).toBe(true);
    expect(reasonPriceConsistent("월 40만원", jeonse)).toBe(false);
    expect(reasonPriceConsistent("전세 3,000만원", jeonse)).toBe(false);
  });
  it("only calls a deposit low when it is below the candidate median", () => {
    const l = home({ deposit: 10000 });
    expect(reasonPriceConsistent("Low deposit of ₩100 million", l, { medianDeposit: 5000 })).toBe(false);
    expect(reasonPriceConsistent("Low deposit of ₩100 million", l)).toBe(false);
    expect(reasonPriceConsistent("Low deposit of ₩100 million", l, { medianDeposit: 20000 })).toBe(true);
    expect(reasonPriceConsistent("낮은 보증금 (1억원)", l, { medianDeposit: 5000 })).toBe(false);
    expect(reasonPriceConsistent("₩100 million deposit, 20 m²", l, { medianDeposit: 5000 })).toBe(true);
  });
  it("parses Korean and English amounts", () => {
    expect(moneyMentions("1억 5,000만원").map((m) => m.won)).toEqual([150_000_000]);
    expect(moneyMentions("3천만원, 월 40만").map((m) => m.won)).toEqual([30_000_000, 400_000]);
    expect(moneyMentions("₩1.2 billion and ₩400,000").map((m) => m.won)).toEqual([1_200_000_000, 400_000]);
  });
  it("median", () => expect(medianOf([1, 5, 3, 9])).toBe(4));
});

describe("assemblePicks with price validation", () => {
  it("replaces a contradicting AI reason with the deterministic one", () => {
    const listing = home();
    const ranked = fallbackRank([listing], c, place, 1500, "", new Date(), "ko");
    const picks = assemblePicks(
      { picks: [{ id: listing.id, reason: "강남역에서 350m · 전세 3,000만원" }], assumptions: [], dropped: 0 },
      ranked,
      1,
      {},
    );
    expect(picks[0]!.reasonSource).toBe("basic");
    expect(picks[0]!.reason).not.toMatch(/전세/);
  });
  it("keeps a consistent AI reason", () => {
    const listing = home();
    const ranked = fallbackRank([listing], c, place, 1500, "", new Date(), "ko");
    const reason = "강남역 인근 · 월세 보증금 3,000만원 / 월 40만원";
    const picks = assemblePicks({ picks: [{ id: listing.id, reason }], assumptions: [], dropped: 0 }, ranked, 1, {});
    expect(picks[0]!.reasonSource).toBe("ai");
  });
  it("sends the model a ready-made price line", () => {
    expect(compactCandidate(home(), place, "ko").price).toBe("월세 보증금 3,000만원 / 월 40만원");
    expect(compactCandidate(home({ deposit: 1000 }), place, "en", undefined, { medianDeposit: 2000 }).depositBelowMedian).toBe(true);
    expect(compactCandidate(home({ deposit: 5000 }), place, "en", undefined, { medianDeposit: 2000 }).depositBelowMedian).toBeUndefined();
  });
});

describe("deterministic Korean reasons state the right rent type", () => {
  it("never says 전세 for monthly listings", () => {
    const list = [1000, 2000, 3000, 5000, 10000].map((deposit, i) =>
      home({ id: `z:${i + 10}`, deposit, rent: 30 + i * 10, lat: place.lat + i * 0.0005 }),
    );
    for (const s of fallbackRank(list, c, place, 1500, "cheap", new Date(), "ko")) {
      expect(s.reason).not.toMatch(/전세/);
    }
  });
});

describe("rooms", () => {
  it("flags one-rooms and tiny unknowns when two rooms are requested", () => {
    expect(roomMatch(home({ roomType: "원룸(오픈형)" }), 2)).toBe("mismatch");
    expect(roomMatch(home({ roomType: "투룸" }), 2)).toBe("match");
    expect(roomMatch(home({ areaM2: 15 }), 2)).toBe("mismatch");
    expect(roomMatch(home({ areaM2: 40 }), 2)).toBe("unknown");
  });
  it("ranks them last and defers AI picks of them", () => {
    const small = home({ id: "z:small", roomType: "원룸", areaM2: 14 });
    const two = home({ id: "z:two", roomType: "투룸", areaM2: 40, lat: place.lat + 0.004 });
    const ranked = fallbackRank([small, two], { ...c, rooms: 2 }, place, 1500, "", new Date(), "ko");
    expect(ranked[0]!.listing.id).toBe("z:two");
    const picks = assemblePicks(
      { picks: [{ id: "z:small" }, { id: "z:two" }], assumptions: [], dropped: 0 },
      ranked,
      2,
      { weakIds: new Set(["z:small"]) },
    );
    expect(picks.map((p) => p.listing.id)).toEqual(["z:two", "z:small"]);
  });
});

describe("language switch keeps the result set", () => {
  const listing = home();
  const ranked = fallbackRank([listing, jeonse], c, place, 1500, "", new Date(), "en");
  const picks = assemblePicks(null, ranked, 2, {});
  const result: Extract<AskPicksResult, { status: "ok" }> = {
    status: "ok",
    picks,
    summary: "English summary",
    assumptions: [t("en", "ask.assume.noPhoto"), t("en", "ask.assume.widened", { base: 800, to: "1.4 km" })],
    constraints: c,
    provider: "local",
    candidateCount: 141,
    radiusM: 1500,
    widened: true,
    sourceErrors: [],
    elapsedMs: 1,
  };
  it("same picks, order, counts and constraints; text in the new language", () => {
    const ko = localizeBasic(result, "en", "ko");
    if (ko.status !== "ok") throw new Error("status");
    expect(ko.picks.map((p) => p.listing.id)).toEqual(picks.map((p) => p.listing.id));
    expect(ko.candidateCount).toBe(141);
    expect(ko.constraints).toEqual(c);
    expect(ko.summary).toContain("141");
    expect(ko.summary).not.toBe("English summary");
    expect(ko.assumptions).toEqual([t("ko", "ask.assume.noPhoto"), t("ko", "ask.assume.widened", { base: 800, to: "1.4 km" })]);
    const back = localizeBasic(ko, "ko", "en");
    expect(back.status === "ok" && back.picks.map((p) => p.listing.id)).toEqual(picks.map((p) => p.listing.id));
  });
  it("relocalizes only known notes", () => {
    expect(relocalizeAssumption("something else", "en", "ko")).toBeNull();
  });
});
