import { describe, expect, it } from "vitest";
import { listingMatchesArea } from "./area";
import { listingMatchesQuery, looksLikePlaceQuery, matchPlace, parseSearchQuery, romanizeHangul } from "./search";
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

  it("does not treat studio or jeonse as a neighborhood name", () => {
    expect(looksLikePlaceQuery("studio")).toBe(false);
    expect(looksLikePlaceQuery("dangsan")).toBe(true);
    expect(matchPlace("a bit cheaper")).toBeUndefined();
    expect(looksLikePlaceQuery("deposit 2000")).toBe(false);
  });

  it("prefers Guro Digital over Guro and does not keep leftover title text", () => {
    expect(matchPlace("guro digital")?.id).toBe("guro-digital");
    expect(matchPlace("guro")?.id).toBe("guro");
    expect(matchPlace("구로디지털단지")?.id).toBe("guro-digital");
    const parsed = parseSearchQuery("guro digital");
    expect(parsed.place?.id).toBe("guro-digital");
    expect(parsed.listingQuery).toBe("");
    expect(parseSearchQuery("guro digital complex").listingQuery).toBe("");
    expect(parseSearchQuery("guro digital studio").listingQuery.toLowerCase()).toContain(
      "studio",
    );
  });

  it("does not treat no-basement as a title search for studios", () => {
    expect(listingMatchesQuery(listing({ propertyType: "oneroom" }), "no")).toBe(false);
    const parsed = parseSearchQuery("no basement");
    expect(parsed.listingQuery).toBe("");
    expect(parsed.floorFilter).toBe("no-basement");
    expect(parseSearchQuery("hongdae no basement").floorFilter).toBe("no-basement");
    expect(parseSearchQuery("hongdae no basement").listingQuery).toBe("");
  });

  it("treats this week as an age filter, not listing text", () => {
    const parsed = parseSearchQuery("hongdae this week");
    expect(parsed.place?.id).toBe("hongdae");
    expect(parsed.ageFilter).toBe("week");
    expect(parsed.listingQuery).toBe("");
  });

  it("does not keep filler words from a spoken Ask sentence as title text", () => {
    expect(
      parseSearchQuery(
        "Find me some good value places that are less than 15 years old near guro digital complex",
      ).listingQuery,
    ).toBe("");
  });

  it("keeps leftover descriptive words as a title filter", () => {
    expect(parseSearchQuery("hongdae pet").listingQuery.toLowerCase()).toContain("pet");
    expect(parseSearchQuery("hongdae furnished rooftop").listingQuery.toLowerCase()).toContain(
      "furnished",
    );
    expect(parseSearchQuery("hongdae furnished rooftop").listingQuery.toLowerCase()).toContain(
      "rooftop",
    );
  });

  it("matches Dangsan station as a walk-radius place, not listing text", () => {
    expect(matchPlace("dangsan station")?.id).toBe("dangsan");
    expect(matchPlace("당산역")?.id).toBe("dangsan");
    expect(parseSearchQuery("dangsan station studio").listingQuery.toLowerCase()).toContain(
      "studio",
    );
    expect(parseSearchQuery("dangsan station").listingQuery).toBe("");
  });
});

describe("area buckets", () => {
  it("treats 8 pyeong as the 20–33 m² bucket", () => {
    const areaM2 = 8 * 3.3058;
    expect(listingMatchesArea(areaM2, ["s"], true)).toBe(true);
    expect(listingMatchesArea(areaM2, ["l"], true)).toBe(false);
  });
});
