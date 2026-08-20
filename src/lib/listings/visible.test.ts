import { describe, expect, it } from "vitest";
import { describeActiveFilters, mapLayersForFilters } from "./visible";
import { type MapListing } from "./types";

function home(
  id: string,
  propertyType: MapListing["propertyType"],
  salesType: MapListing["salesType"] = "wolse",
): MapListing {
  return {
    id,
    source: "zigbang",
    sourceId: id,
    lat: 37.556,
    lng: 126.923,
    propertyType,
    salesType,
    deposit: 1000,
    rent: 70,
    url: "https://example.com",
  };
}

describe("map layers follow filters", () => {
  it("keeps apartments off the map when that chip is unchecked", () => {
    const layers = mapLayersForFilters(
      [home("studio", "oneroom"), home("apt", "apartment")],
      [
        {
          id: "stale",
          lat: 37.55,
          lng: 126.92,
          count: 40,
          sources: { zigbang: 40 },
        },
      ],
      {
        propertyTypes: ["oneroom"],
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        zoom: 16,
      },
    );
    expect(layers.listings.map((item) => item.id)).toEqual(["studio"]);
    expect(layers.clusters).toEqual([]);
  });

  it("does not keep a stale unfiltered cluster when types are filtered", () => {
    const layers = mapLayersForFilters(
      [home("studio", "oneroom")],
      [
        {
          id: "old-all-types",
          lat: 37.55,
          lng: 126.92,
          count: 900,
          sources: { zigbang: 900 },
        },
      ],
      {
        propertyTypes: ["oneroom"],
        salesTypes: ["wolse"],
        areaBucketIds: [],
        query: "",
        zoom: 13,
      },
    );
    expect(layers.listings.map((item) => item.id)).toEqual(["studio"]);
    expect(layers.clusters.some((cluster) => cluster.id === "old-all-types")).toBe(
      false,
    );
  });

  it("omits the default jeonse + monthly mix from the compact summary", () => {
    expect(
      describeActiveFilters({
        propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
      }),
    ).toBeNull();
    expect(
      describeActiveFilters({
        propertyTypes: ["oneroom"],
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
      }),
    ).toBe("Studio");
    expect(
      describeActiveFilters({
        propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        foreignerOk: true,
      }),
    ).toBe("Foreigners welcome");
    expect(
      describeActiveFilters({
        propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        floorFilter: "no-basement",
      }),
    ).toBe("No basement");
    expect(
      describeActiveFilters({
        propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        ageFilter: "week",
      }),
    ).toBe("This week");
  });
});
