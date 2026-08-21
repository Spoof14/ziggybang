import { describe, expect, it } from "vitest";
import { listingMatchesArea } from "./area";
import {
  circleForPlaceSearch,
  listingMatchesQuery,
  looksLikePlaceQuery,
  matchPlace,
  matchPlaceInAddress,
  parseSearchQuery,
  romanizeHangul,
} from "./search";
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

  it("maps 강서 to Gangseo-gu, not Gangnam", () => {
    expect(matchPlace("강서")?.id).toBe("gangseo");
    expect(matchPlace("gangseo")?.id).toBe("gangseo");
    expect(matchPlace("강서구")?.id).toBe("gangseo");
    expect(matchPlace("강서")?.lng).toBeLessThan(127);
    expect(matchPlace("강남")?.id).toBe("gangnam");
    expect(parseSearchQuery("강서").listingQuery).toBe("");
  });

  it("maps other 강 districts to Seoul, not a nearby 강남-style name", () => {
    expect(matchPlace("강북")?.id).toBe("gangbuk");
    expect(matchPlace("강북")?.lat).toBeCloseTo(37.64, 2);
    expect(matchPlace("강동")?.id).toBe("gangdong");
    expect(matchPlace("노원")?.id).toBe("nowon");
    expect(matchPlace("성북")?.id).toBe("seongbuk");
    expect(matchPlace("성북")?.lat).toBeLessThan(37.64);
  });

  it("maps Gangseo neighborhoods and Apgujeong by name", () => {
    expect(matchPlace("화곡")?.id).toBe("hwagok");
    expect(matchPlace("가양")?.id).toBe("gayang");
    expect(matchPlace("압구정")?.id).toBe("apgujeong");
    expect(matchPlace("금천")?.id).toBe("geumcheon");
    expect(matchPlace("은평")?.id).toBe("eunpyeong");
  });

  it("does not clip a 구 search to a leftover station radius", () => {
    const gangseo = matchPlace("강서")!;
    expect(circleForPlaceSearch(gangseo, "강서", 800)).toBeNull();
    const hwagok = matchPlace("화곡")!;
    expect(circleForPlaceSearch(hwagok, "화곡", 1200)?.radiusM).toBe(800);
  });

  it("labels Magok and Sinchon instead of their parent 구", () => {
    expect(matchPlaceInAddress("서울 강서구 마곡동")?.id).toBe("magok");
    expect(matchPlaceInAddress("서울 서대문구 신촌동")?.id).toBe("sinchon");
    expect(matchPlaceInAddress("서울 광진구 화양동")?.id).toBe("konkuk");
  });
});

describe("area buckets", () => {
  it("treats 8 pyeong as the 20–33 m² bucket", () => {
    const areaM2 = 8 * 3.3058;
    expect(listingMatchesArea(areaM2, ["s"], true)).toBe(true);
    expect(listingMatchesArea(areaM2, ["l"], true)).toBe(false);
  });
});
