import { describe, expect, it } from "vitest";
import {
  areaLabel,
  buildAskSummary,
  collapseDuplicates,
  detectRoomCount,
  diversify,
  effectiveMonthlyManwon,
  floorKind,
  listingRooms,
  reasonIsGrounded,
  sizeClass,
} from "./ask-quality";
import {
  activeSlideIndex,
  assemblePicks,
  compactCandidate,
  constraintChips,
  constraintsToSnapshot,
  fallbackRank,
  hardFilterCandidates,
  prepareRanked,
  visibleSlideRange,
  type AskConstraints,
} from "./ask-picks";
import { formatFloor } from "./copy";
import { buildAppSearch, parseAppUrl } from "./url-state";
import { type MapListing } from "./types";

const mangwon = { name: "망원동", lat: 37.556, lng: 126.91, radiusM: 800, kind: "place" as const };
let seq = 0;
function home(over: Record<string, unknown> = {}): MapListing {
  seq += 1;
  return {
    id: `zigbang:oneroom:q${seq}`,
    source: "zigbang",
    sourceId: `q${seq}`,
    lat: mangwon.lat + seq * 0.0003,
    lng: mangwon.lng,
    propertyType: "oneroom",
    salesType: "wolse",
    deposit: 1000,
    rent: 55,
    areaM2: 20,
    floor: "3/5",
    approveDate: "2015-01-01",
    thumbnail: "https://ic.zigbang.com/a.jpg",
    url: "https://example.com",
    ...over,
  } as MapListing;
}
const center = { lat: mangwon.lat, lng: mangwon.lng };

describe("Korean floor labels", () => {
  it.each([
    ["옥탑방/4", "Rooftop"],
    ["반지하/2", "Semi-basement"],
    ["고층/11층", "High floor of 11"],
    ["고/21", "High floor of 21"],
    ["중/21", "Mid floor of 21"],
    ["저/21", "Low floor of 21"],
    ["저층", "Low floor"],
    ["11층", "Floor 11"],
    ["9/21", "Floor 9 of 21"],
    ["1/2", "Floor 1 of 2"],
    ["지하1", "Basement"],
  ])("%s → %s", (raw, label) => {
    expect(formatFloor(raw)).toBe(label);
  });
  it("classifies basement-like units", () => {
    expect(floorKind("반지하/2")).toBe("semi-basement");
    expect(floorKind("옥탑방/4")).toBe("rooftop");
    expect(floorKind("3/5")).toBe("normal");
  });
});

describe("room counts", () => {
  it("reads Korean and English phrasing", () => {
    expect(detectRoomCount("망원동 투룸 월세")).toBe(2);
    expect(detectRoomCount("쓰리룸 전세")).toBe(3);
    expect(detectRoomCount("2룸")).toBe(2);
    expect(detectRoomCount("2 bedroom villa")).toBe(2);
    expect(detectRoomCount("cheap studio")).toBeUndefined();
  });
  it("derives a listing's rooms from roomType / title, else says nothing", () => {
    expect(listingRooms(home({ roomType: "투룸" }))).toBe(2);
    expect(listingRooms(home({ roomType: "쓰리룸+" }))).toBe(3);
    expect(listingRooms(home({ roomType: "오픈형원룸" }))).toBe(1);
    expect(listingRooms(home({ roomType: undefined, title: "망원역도보 다가구 반지층 2룸 공실" }))).toBe(2);
    expect(listingRooms(home({ roomType: undefined, title: "깨끗한 집" }))).toBeUndefined();
  });
  it("hard filter keeps two-room homes and unknowns, drops stated one-rooms; chip says best effort", () => {
    const two = home({ roomType: "투룸" });
    const one = home({ roomType: "오픈형원룸" });
    const unknown = home({ roomType: undefined });
    const c: AskConstraints = { place: mangwon, rooms: 2 };
    const out = hardFilterCandidates([one, unknown, two], c, 800).listings.map((l) => l.id);
    expect(out).toContain(two.id);
    expect(out).toContain(unknown.id);
    expect(out).not.toContain(one.id);
    expect(constraintChips(c).map((x) => x.label)).toContain("Two-room (best effort)");
  });
  it("uses only stated two-rooms when there are enough of them", () => {
    const twos = Array.from({ length: 10 }, () => home({ roomType: "투룸" }));
    const unknown = home({ roomType: undefined });
    const out = hardFilterCandidates([...twos, unknown], { place: mangwon, rooms: 2 }, 800).listings;
    expect(out).toHaveLength(10);
  });
});

describe("size classes", () => {
  it("labels from the real m²", () => {
    expect(sizeClass(14)).toBe("tiny");
    expect(sizeClass(14.31)).toBe("tiny");
    expect(sizeClass(20)).toBe("small");
    expect(sizeClass(28)).toBe("medium");
    expect(sizeClass(35)).toBe("large");
    expect(sizeClass(60)).toBe("very large");
    expect(sizeClass(undefined)).toBeUndefined();
  });
});

describe("cost", () => {
  it("adds deposit cost at 5% a year so a big deposit isn't 'cheap'", () => {
    const bigDeposit = home({ deposit: 8000, rent: 25 });
    const smallDeposit = home({ deposit: 500, rent: 45 });
    expect(effectiveMonthlyManwon(bigDeposit)!).toBeGreaterThan(effectiveMonthlyManwon(smallDeposit)!);
    const ranked = fallbackRank([bigDeposit, smallDeposit], { place: mangwon, preferences: ["low cost"] }, center, 800, "cheap");
    expect(ranked[0]!.listing.id).toBe(smallDeposit.id);
  });
});

describe("duplicates", () => {
  const naver = (over: Record<string, unknown> = {}) =>
    home({ source: "naver", id: `naver:apartment:${++seq}`, lat: 37.494, lng: 127.0278, propertyType: "apartment", salesType: "jeonse", deposit: 25000, rent: undefined, areaM2: 35, floor: "중/21", title: "삼성쉐르빌II", thumbnail: undefined, ...over });
  it("collapses the same complex/price/size/floor text and counts the group", () => {
    const list = [naver(), naver(), naver(), naver({ floor: "9/21" }), naver({ floor: "9/21" }), naver({ floor: "저/21" })];
    const { items, groupSize } = collapseDuplicates(list.map((listing) => ({ listing })));
    expect(items).toHaveLength(3);
    expect([...groupSize.values()]).toEqual([6]);
  });
  it("keeps the copy with a photo", () => {
    const withPhoto = naver({ thumbnail: "https://landthumb-phinf.pstatic.net/x.jpg" });
    const { items } = collapseDuplicates([{ listing: naver() }, { listing: withPhoto }]);
    expect(items[0]!.listing.id).toBe(withPhoto.id);
  });
  it("caps one complex at 2 picks and reports +N similar", () => {
    const sameComplex = [naver({ floor: "중/21" }), naver({ floor: "9/21" }), naver({ floor: "저/21" }), naver({ floor: "12/21" }), naver({ floor: "15/21" })];
    const others = Array.from({ length: 9 }, (_, i) => home({ rent: 60 + i }));
    const ranked = fallbackRank([...sameComplex, ...others], { place: mangwon }, center, 3000);
    const prepared = prepareRanked(ranked);
    const picks = assemblePicks(null, prepared.ranked, 10, prepared.groupSize);
    const fromComplex = picks.filter((p) => p.listing.source === "naver");
    expect(fromComplex.length).toBeLessThanOrEqual(2);
    expect(fromComplex.some((p) => (p.similar ?? 0) >= 3)).toBe(true);
    expect(picks).toHaveLength(10);
  });
  it("diversify pushes extras behind everyone else", () => {
    const a = [naver({ floor: "1/21" }), naver({ floor: "2/21" }), naver({ floor: "3/21" }), home()].map((listing) => ({ listing }));
    const out = diversify(a, 2).map((x) => x.listing.source);
    expect(out).toEqual(["naver", "naver", "zigbang", "naver"]);
  });
});

describe("fallback scoring", () => {
  it("penalises semi-basement/rooftop for generic requests, not when asked", () => {
    const basement = home({ floor: "반지하/2", rent: 40 });
    const normal = home({ floor: "3/5", rent: 50 });
    const generic = fallbackRank([basement, normal], { place: mangwon }, center, 800, "studio near mangwon");
    expect(generic[0]!.listing.id).toBe(normal.id);
    const asked = fallbackRank([basement, normal], { place: mangwon }, center, 800, "반지하 괜찮아요");
    expect(asked[0]!.listing.id).toBe(basement.id);
  });
  it("breaks ties toward listings with photos", () => {
    const noPhoto = home({ thumbnail: undefined, photos: undefined, lat: mangwon.lat, rent: 55 });
    const photo = home({ lat: mangwon.lat, rent: 55 });
    expect(fallbackRank([noPhoto, photo], { place: mangwon }, center, 800)[0]!.listing.id).toBe(photo.id);
  });
  it("varies phrasing between cards", () => {
    const list = Array.from({ length: 12 }, (_, i) => home({ rent: 40 + i, lat: mangwon.lat + i * 0.0001 }));
    const reasons = new Set(fallbackRank(list, { place: mangwon }, center, 800).map((r) => r.reason.replace(/[\d,₩.]+/g, "#")));
    expect(reasons.size).toBeGreaterThan(2);
  });
});

describe("what the AI sees and may say", () => {
  it("omits fields the listing lacks and uses English floor + size words", () => {
    const naver = home({ source: "naver", approveDate: undefined, address: undefined, floor: "옥탑방/4", areaM2: 14 });
    const c = compactCandidate(naver, center);
    expect(c).not.toHaveProperty("builtYear");
    expect(c).not.toHaveProperty("subwayWalkMin");
    expect(c.floor).toBe("Rooftop");
    expect(c.size).toBe("tiny");
    expect(c.metersFromCenter).toBeGreaterThanOrEqual(0);
  });
  it("rejects reasons that state facts the data doesn't have", () => {
    const facts = { tags: [] as string[], floor: "3/5", m2: 14 };
    expect(reasonIsGrounded("₩250 million, built 2019, spacious", facts)).toBe(false);
    expect(reasonIsGrounded("5 min walk to the subway", facts)).toBe(false);
    expect(reasonIsGrounded("Quiet street, elevator", facts)).toBe(false);
    expect(reasonIsGrounded("Tiny 14 m² unit, ₩250 million, 436 m from Gangnam", facts)).toBe(true);
    expect(reasonIsGrounded("Built 2019", { ...facts, builtYear: 2019 })).toBe(true);
    expect(reasonIsGrounded("Built 2001", { ...facts, builtYear: 2019 })).toBe(false);
  });
  it("replaces an ungrounded AI reason with the basic one when assembling", () => {
    const l = home({ approveDate: undefined });
    const ranked = fallbackRank([l], { place: mangwon }, center, 800);
    const [pick] = assemblePicks({ picks: [{ id: l.id, reason: "Built 2019, spacious" }], assumptions: [], dropped: 0 }, ranked, 1);
    expect(pick!.reasonSource).toBe("basic");
    expect(pick!.reason).not.toMatch(/2019/);
  });
});

describe("area label", () => {
  it("uses the nearest known place, so a home 110 m from Mangwon isn't 'Hongdae'", () => {
    const l = { lat: 37.5565, lng: 126.9112, address: "서울시 마포구 서교동" };
    expect(areaLabel(l)).toBe("Near Mangwon");
  });
  it("falls back to the address district when nothing is near", () => {
    expect(areaLabel({ lat: 37.7, lng: 127.2, address: "서울시 노원구 상계동" })).toMatch(/Nowon/);
    expect(areaLabel({ lat: 37.7, lng: 127.2 })).toBeNull();
  });
});

describe("deterministic summary", () => {
  it("is generated from the final constraints and picks", () => {
    const picks = [home({ rent: 45 }), home({ rent: 70, areaM2: 30 })];
    const text = buildAskSummary({ count: 2, candidates: 20, placeName: "Mangwon", typeWord: "home", deals: ["wolse"], rooms: 2, picks });
    expect(text).toBe("Top 2 monthly-rent two-room homes near Mangwon, from 20 matches: rent ₩450,000–700,000/mo, deposit ₩10 million, 20–30 m².");
    const noCap = buildAskSummary({ count: 2, candidates: 20, placeName: "Mangwon", typeWord: "home", deals: ["wolse"], picks: [home({ rent: 45 })] });
    expect(noCap).not.toMatch(/800,000|under/);
  });
});

describe("carousel counter", () => {
  it("shows the last card once scrolled to the end", () => {
    expect(activeSlideIndex(1000, 200, 10, false)).toBe(5);
    expect(activeSlideIndex(1000, 200, 10, true)).toBe(9);
  });
  it("reports the visible range", () => {
    expect(visibleSlideRange(0, 300, 280, 10, 260)).toEqual({ first: 0, last: 0 });
    expect(visibleSlideRange(0, 600, 280, 10, 260)).toEqual({ first: 0, last: 1 });
    expect(visibleSlideRange(2520, 400, 280, 10, 260)).toEqual({ first: 9, last: 9 });
  });
});

describe("Apply as filters", () => {
  const c: AskConstraints = {
    place: mangwon,
    salesTypes: ["wolse"],
    propertyTypes: ["villa", "oneroom"],
    areaBucketIds: ["s", "m"],
    minDeposit: 500,
    maxDeposit: 3000,
    minRent: 30,
    maxRent: 80,
    maxBuildingAge: 15,
    floorFilter: "no-basement",
    rooms: 2,
  };
  it("maps every structured constraint into the filter snapshot", () => {
    const snap = constraintsToSnapshot(c);
    expect(snap).toMatchObject({
      searchInput: "망원동",
      salesTypes: ["wolse"],
      propertyTypes: ["villa", "oneroom"],
      areaBucketIds: ["s", "m"],
      minDeposit: 500,
      maxDeposit: 3000,
      minRent: 30,
      maxRent: 80,
      maxBuildingAge: 15,
      floorFilter: "no-basement",
      radiusM: 800,
    });
  });
  it("survives the URL round trip, including the budget", () => {
    const snap = constraintsToSnapshot(c);
    const search = buildAppSearch({
      ...snap,
      sources: ["zigbang", "naver", "peterpan"],
      view: { lat: 37.556, lng: 126.91, zoom: 16 },
      listSort: "featured",
    });
    const url = parseAppUrl(search);
    expect(url).toMatchObject({ searchInput: "망원동", maxRent: 80, minRent: 30, maxDeposit: 3000, minDeposit: 500, radiusM: 800, maxBuildingAge: 15, floorFilter: "no-basement" });
    expect(url.salesTypes).toEqual(["wolse"]);
    expect(url.areaBucketIds).toEqual(["s", "m"]);
  });
});
