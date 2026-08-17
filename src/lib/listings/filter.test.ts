import { describe, expect, it } from "vitest";
import { filterBySalesTypes, filterListings, isAllSalesTypes } from "./filter";
import { type MapListing } from "./types";

function listing(id: string, salesType?: MapListing["salesType"]): MapListing {
  return {
    id,
    source: "zigbang",
    sourceId: id,
    lat: 37.5,
    lng: 127,
    propertyType: "oneroom",
    salesType,
    url: "https://example.com",
  };
}

describe("sales type filters", () => {
  it("treats an empty or complete selection as no filter", () => {
    expect(isAllSalesTypes([])).toBe(true);
    expect(isAllSalesTypes(["jeonse", "wolse", "sale"])).toBe(true);
    expect(isAllSalesTypes(["jeonse"])).toBe(false);
  });

  it("keeps untyped markers until details are required", () => {
    const listings = [
      listing("a", "jeonse"),
      listing("b", "wolse"),
      listing("c"),
    ];
    expect(filterBySalesTypes(listings, ["jeonse"], false).map((item) => item.id)).toEqual(
      ["a", "c"],
    );
    expect(filterBySalesTypes(listings, ["jeonse"], true).map((item) => item.id)).toEqual(
      ["a"],
    );
  });

  it("applies size and search together", () => {
    const listings = [
      listing("a", "jeonse"),
      {
        ...listing("b", "jeonse"),
        address: "연남동",
        areaM2: 24,
      },
    ];
    expect(
      filterListings(listings, {
        salesTypes: ["jeonse"],
        areaBucketIds: ["s"],
        query: "yeonnam",
        requireDetails: true,
      }).map((item) => item.id),
    ).toEqual(["b"]);
  });
});
