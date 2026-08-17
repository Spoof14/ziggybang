import { describe, expect, it } from "vitest";
import { listingMatchesArea } from "./area";
import { listingMatchesQuery, matchPlace, parseSearchQuery, romanizeHangul } from "./search";
import { type MapListing } from "./types";

function listing(partial: Partial<MapListing> = {}): MapListing {
  return {
    id: "1",
    source: "zigbang",
    sourceId: "1",
    lat: 37.55,
    lng: 126.92,
    propertyType: "oneroom",
    url: "https://example.com",
    ...partial,
  };
}

describe("bilingual fuzzy search", () => {
  it("romanizes Hangul so English queries can match Korean text", () => {
    expect(romanizeHangul("강남")).toContain("gangnam");
    expect(romanizeHangul("홍대")).toContain("hongdae");
  });

  it("matches English property words to Korean listings", () => {
    expect(listingMatchesQuery(listing({ propertyType: "oneroom" }), "studio")).toBe(true);
    expect(listingMatchesQuery(listing({ propertyType: "villa" }), "studio")).toBe(false);
    expect(
      listingMatchesQuery(listing({ address: "서울 마포구 연남동" }), "yeonnam"),
    ).toBe(true);
  });

  it("tolerates a one-letter typo in neighborhood names", () => {
    expect(matchPlace("gangnm")?.id).toBe("gangnam");
    expect(matchPlace("Hongdae studio")?.id).toBe("hongdae");
    expect(parseSearchQuery("연남동 studio").listingQuery.toLowerCase()).toContain("studio");
  });

  it("treats Hongdae as a place so leftover listing text can be empty", () => {
    const parsed = parseSearchQuery("hongdae");
    expect(parsed.place?.id).toBe("hongdae");
    expect(parsed.listingQuery).toBe("");
  });
});

describe("area buckets", () => {
  it("treats 8 pyeong as the 20–33 m² bucket", () => {
    const areaM2 = 8 * 3.3058;
    expect(listingMatchesArea(areaM2, ["s"], true)).toBe(true);
    expect(listingMatchesArea(areaM2, ["l"], true)).toBe(false);
  });
});
