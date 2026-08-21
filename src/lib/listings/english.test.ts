import { describe, expect, it } from "vitest";
import {
  englishAddressLine,
  englishCardTitle,
  englishDistrict,
  englishNeighborhood,
  koreanAddressForTaxi,
  listingCardMeta,
} from "./english";
import { type MapListing } from "./types";

const listing: MapListing = {
  id: "1",
  source: "zigbang",
  sourceId: "1",
  lat: 37.56,
  lng: 126.92,
  propertyType: "oneroom",
  salesType: "wolse",
  roomType: "분리형원룸",
  address: "서울 마포구 연남동",
  floor: "3/5",
  areaM2: 25,
  url: "https://example.com",
};

describe("English listing cards", () => {
  it("turns a Korean address into a neighborhood title", () => {
    expect(englishCardTitle(listing)).toContain("Yeonnam");
    expect(englishCardTitle(listing)).toContain("Split studio");
    expect(englishCardTitle(listing)).toContain("Monthly");
    expect(englishAddressLine(listing)).toBe("Yeonnam · Mapo-gu");
    expect(englishAddressLine(listing)).not.toMatch(/[가-힣]/);
  });

  it("keeps Magok listings labeled Magok inside Gangseo-gu", () => {
    expect(englishNeighborhood("서울 강서구 마곡동")).toBe("Magok");
    expect(englishNeighborhood("서울 서대문구 신촌동")).toBe("Sinchon");
    expect(englishDistrict("서울 강서구 화곡동")).toBe("Gangseo-gu");
  });

  it("romanizes the district instead of appending Hangul", () => {
    expect(englishDistrict("서울시 마포구 창전동")).toBe("Mapo-gu");
    expect(
      englishAddressLine({
        ...listing,
        address: "서울시 마포구 창전동",
      }),
    ).toBe("Mapo-gu");
    expect(koreanAddressForTaxi("서울시 마포구 창전동")).toBe(
      "서울시 마포구 창전동",
    );
  });

  it("puts floor and size on the card subtitle", () => {
    expect(listingCardMeta(listing)).toContain("Yeonnam");
    expect(listingCardMeta(listing)).toContain("25");
    expect(listingCardMeta(listing)).toContain("Floor 3 of 5");
  });
});
