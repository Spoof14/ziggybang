import { describe, expect, it } from "vitest";
import {
  mapZigbangPropertyType,
  mapZigbangSalesType,
  zigbangComplexToListing,
  zigbangListingUrl,
  zigbangMarkerToListing,
} from "./zigbang";

describe("zigbang mappers", () => {
  it("maps a house-property marker into a unified listing", () => {
    const listing = zigbangMarkerToListing(
      { id: 47814532, lat: 37.57, lng: 127.04 },
      "oneroom",
    );
    expect(listing).toMatchObject({
      id: "zigbang:oneroom:47814532",
      source: "zigbang",
      sourceId: "47814532",
      propertyType: "oneroom",
      thumbnail: "https://ic.zigbang.com/ic/items/47814532/1.jpg",
      url: "https://www.zigbang.com/home/oneroom/items/47814532",
    });
  });

  it("drops incomplete markers", () => {
    expect(zigbangMarkerToListing({ lat: 37.5 }, "villa")).toBeNull();
  });

  it("maps apartment complexes with a listing count", () => {
    const listing = zigbangComplexToListing({
      areaDanjiId: 946,
      lat: 37.49,
      lng: 127.06,
      itemIds: ["C1", "C2", "C3"],
    });
    expect(listing).toMatchObject({
      id: "zigbang:apartment:946",
      count: 3,
      url: "https://www.zigbang.com/home/apt/danjis/946",
    });
  });

  it("maps Korean sales and property labels", () => {
    expect(mapZigbangSalesType("전세")).toBe("jeonse");
    expect(mapZigbangSalesType("월세")).toBe("wolse");
    expect(mapZigbangSalesType("매매")).toBe("sale");
    expect(mapZigbangPropertyType("오피스텔")).toBe("officetel");
    expect(zigbangListingUrl("officetel", "1")).toContain("/officetel/items/1");
  });
});
