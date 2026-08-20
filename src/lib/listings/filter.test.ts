import { describe, expect, it } from "vitest";
import { filterBySalesTypes, filterListings, isAllSalesTypes, isDefaultRentSales, needsHydratedFilters } from "./filter";
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

  it("drops homes outside deposit and rent bounds once prices are known", () => {
    const listings = [
      { ...listing("cheap", "wolse"), deposit: 500, rent: 50 },
      { ...listing("mid", "wolse"), deposit: 1000, rent: 70 },
      listing("unknown", "wolse"),
    ];
    expect(
      filterListings(listings, {
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: true,
        maxDeposit: 800,
        maxRent: 60,
      }).map((item) => item.id),
    ).toEqual(["cheap"]);
  });

  it("drops apartments when that property type is unchecked", () => {
    const listings = [
      listing("studio", "wolse"),
      {
        ...listing("apt", "wolse"),
        id: "apt",
        sourceId: "apt",
        propertyType: "apartment" as const,
      },
    ];
    expect(
      filterListings(listings, {
        propertyTypes: ["oneroom"],
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: false,
      }).map((item) => item.id),
    ).toEqual(["studio"]);
  });

  it("keeps only listings that say foreigners are welcome", () => {
    const listings = [
      { ...listing("ok", "wolse"), foreignerOk: true },
      { ...listing("silent", "wolse") },
      { ...listing("no", "wolse"), foreignerOk: false },
    ];
    expect(
      filterListings(listings, {
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: true,
        foreignerOk: true,
      }).map((item) => item.id),
    ).toEqual(["ok"]);
  });

  it("drops basement floors when that chip is on", () => {
    const listings = [
      { ...listing("base", "wolse"), floor: "반지하/3" },
      { ...listing("second", "wolse"), floor: "2/5" },
      { ...listing("first", "wolse"), floor: "1/4" },
      listing("unknown", "wolse"),
    ];
    expect(
      filterListings(listings, {
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: true,
        floorFilter: "no-basement",
      }).map((item) => item.id),
    ).toEqual(["second", "first"]);
    expect(
      filterListings(listings, {
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: true,
        floorFilter: "min-2",
      }).map((item) => item.id),
    ).toEqual(["second"]);
  });

  it("drops older buildings when the max-age slider is set", () => {
    const listings = [
      { ...listing("new", "wolse"), approveDate: "2020.03.15" },
      { ...listing("mid", "wolse"), approveDate: "2010-06-01" },
      { ...listing("old", "wolse"), approveDate: "1998/12" },
      listing("unknown", "wolse"),
    ];
    expect(
      filterListings(listings, {
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: true,
        maxBuildingAge: 20,
      }).map((item) => item.id),
    ).toEqual(["new", "mid"]);
  });

  it("drops older listings when the age chip is on", () => {
    const day = 24 * 60 * 60 * 1000;
    const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
    const listings = [
      { ...listing("new", "wolse"), updatedAt: iso(2) },
      { ...listing("mid", "wolse"), updatedAt: iso(14) },
      { ...listing("old", "wolse"), updatedAt: iso(60) },
      listing("unknown", "wolse"),
    ];
    expect(
      filterListings(listings, {
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: true,
        ageFilter: "week",
      }).map((item) => item.id),
    ).toEqual(["new"]);
    expect(
      filterListings(listings, {
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        requireDetails: true,
        ageFilter: "month",
      }).map((item) => item.id),
    ).toEqual(["new", "mid"]);
  });
});

describe("hydrated vs default rent filters", () => {
  it("does not treat jeonse + monthly as needing hydrated homes", () => {
    expect(isDefaultRentSales(["jeonse", "wolse"])).toBe(true);
    expect(
      needsHydratedFilters({
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
      }),
    ).toBe(false);
    expect(
      needsHydratedFilters({
        salesTypes: ["jeonse"],
        areaBucketIds: [],
        query: "",
      }),
    ).toBe(true);
    expect(
      needsHydratedFilters({
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: ["s"],
        query: "",
      }),
    ).toBe(true);
    expect(
      needsHydratedFilters({
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
        foreignerOk: true,
      }),
    ).toBe(true);
    expect(
      needsHydratedFilters({
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
        floorFilter: "no-basement",
      }),
    ).toBe(true);
    expect(
      needsHydratedFilters({
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
        ageFilter: "week",
      }),
    ).toBe(true);
    expect(
      needsHydratedFilters({
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
        maxBuildingAge: 10,
      }),
    ).toBe(true);
  });
});
