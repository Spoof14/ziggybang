import { describe, expect, it } from "vitest";
import {
  anchoredFollowup,
  approxCommuteMin,
  commuteRadiusM,
  parseCommute,
  parseOrdinalRef,
  similarConstraints,
  type PriorPick,
} from "./ask-followup";
import { constraintChips, hardFilterCandidates, removeConstraint, sanitizeConstraints } from "./ask-picks";
import { type MapListing } from "./types";

const GANGNAM = { name: "Gangnam", lat: 37.4979, lng: 127.0276, maxMin: 30 };

function home(id: string, lat: number, lng: number, extra: Partial<MapListing> = {}): MapListing {
  return {
    id,
    source: "zigbang",
    sourceId: id,
    propertyType: "oneroom",
    lat,
    lng,
    salesType: "wolse",
    deposit: 1000,
    rent: 60,
    areaM2: 25,
    ...extra,
  } as MapListing;
}

describe("parseCommute", () => {
  it.each([
    ["within 30 min of Gangnam Station", "Gangnam", 30],
    ["studio under 700k within 25 minutes to Seoul Station", "Seoul", 25],
    ["30 min to Samsung", "Samsung", 30],
    ["a place with a commute to Samsung under 20 min", "Samsung", 20],
    ["강남역까지 30분 이내", "강남", 30],
  ])("%s", (text, dest, min) => {
    const parsed = parseCommute(text);
    expect(parsed?.maxMin).toBe(min);
    expect(parsed?.destination).toContain(dest);
  });
  it("ignores text without a commute", () => {
    expect(parseCommute("cheap studio near Hongdae")).toBeNull();
    expect(parseCommute("2 rooms, 5 minutes walk")).toBeNull();
  });
  it("rejects absurd times", () => {
    expect(parseCommute("within 300 min of Gangnam")).toBeNull();
  });
});

describe("approximate commute", () => {
  it("is monotonic, rounded to 5 min and invertible-ish", () => {
    expect(approxCommuteMin(0)).toBe(10);
    expect(approxCommuteMin(2000)).toBeLessThan(approxCommuteMin(6000));
    expect(approxCommuteMin(3000) % 5).toBe(0);
    expect(approxCommuteMin(commuteRadiusM(30))).toBeLessThanOrEqual(30);
  });
  it("filters hard by commute and excludes the anchor", () => {
    const near = home("near", 37.5, 127.03);
    const far = home("far", 37.62, 127.03);
    const c = sanitizeConstraints({
      place: { name: "Gangnam", lat: GANGNAM.lat, lng: GANGNAM.lng, radiusM: 4000, kind: "place" },
      commute: { ...GANGNAM, maxMin: 20 },
      similarTo: { id: "near", label: "x" },
    });
    expect(hardFilterCandidates([near, far], c).listings).toEqual([]);
    const c2 = { ...c, similarTo: undefined };
    expect(hardFilterCandidates([near, far], c2).listings.map((l) => l.id)).toEqual(["near"]);
  });
  it("labels the chip as approximate and can remove it", () => {
    const chips = constraintChips({ commute: GANGNAM }, "en");
    expect(chips.find((c) => c.key === "commute")?.label).toBe("Commute ≤30 min to Gangnam (approx.)");
    expect(constraintChips({ commute: GANGNAM }, "ko").find((c) => c.key === "commute")?.label).toContain("30분");
    expect(removeConstraint({ commute: GANGNAM }, "commute").commute).toBeUndefined();
  });
});

describe("ordinal references", () => {
  it("resolves 'the second one but cheaper'", () => {
    expect(parseOrdinalRef("the second one but cheaper")).toBe(2);
    expect(parseOrdinalRef("#3 but bigger")).toBe(3);
    expect(parseOrdinalRef("두 번째 매물보다 저렴하게")).toBe(2);
  });
  it("does not treat room counts as ordinals", () => {
    expect(parseOrdinalRef("2 rooms near Hongdae")).toBeNull();
    expect(parseOrdinalRef("anything bigger?")).toBeNull();
  });
});

const anchor: PriorPick = {
  rank: 2,
  id: "a1",
  propertyType: "oneroom",
  salesType: "wolse",
  deposit: 1000,
  rent: 60,
  areaM2: 25,
  lat: 37.55,
  lng: 126.92,
  label: "Hongdae",
};

describe("anchors", () => {
  it("builds 'similar to this' around the listing", () => {
    const c = similarConstraints(anchor);
    expect(c.place).toMatchObject({ lat: 37.55, lng: 126.92, radiusM: 1000, kind: "place" });
    expect(c.propertyTypes).toEqual(["oneroom"]);
    expect(c.salesTypes).toEqual(["wolse"]);
    expect(c.minRent).toBe(50);
    expect(c.maxRent).toBeGreaterThanOrEqual(72);
    expect(c.areaBucketIds).toEqual(["s"]);
    expect(c.similarTo?.id).toBe("a1");
  });
  it("applies 'but cheaper / bigger / closer to subway'", () => {
    const c = anchoredFollowup(anchor, "the second one but cheaper and bigger, closer to the subway");
    expect(c.maxRent).toBeLessThan(60);
    expect(c.minRent).toBeUndefined();
    expect(c.areaBucketIds).toEqual(["m", "l"]);
    expect(c.preferences).toContain("close to subway");
  });
});
