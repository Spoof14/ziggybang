import { describe, expect, it } from "vitest";
import { englishAddressLine, englishCardTitle } from "./english";
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
  url: "https://example.com",
};

describe("English listing cards", () => {
  it("turns a Korean address into a neighborhood title", () => {
    expect(englishCardTitle(listing)).toContain("Yeonnam");
    expect(englishCardTitle(listing)).toContain("Split studio");
    expect(englishCardTitle(listing)).toContain("Monthly");
    expect(englishAddressLine(listing)).toContain("Yeonnam");
  });
});
