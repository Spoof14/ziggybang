import { describe, expect, it } from "vitest";
import { describeActiveFilters, layerSourceCounts, mapLayersForFilters } from "./visible";
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

  it("keeps server area clusters when zoomed out with no individual homes", () => {
    const layers = mapLayersForFilters(
      [],
      [
        {
          id: "seoul",
          lat: 37.56,
          lng: 126.97,
          count: 6000,
          sources: { naver: 6000 },
        },
      ],
      {
        propertyTypes: ["oneroom"],
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
        zoom: 12,
        hasPhotos: true,
      },
    );
    expect(layers.listings).toEqual([]);
    expect(layers.clusters).toEqual([
      {
        id: "seoul",
        lat: 37.56,
        lng: 126.97,
        count: 6000,
        sources: { naver: 6000 },
      },
    ]);
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
        hasPhotos: true,
      }),
    ).toBe("Has photos");
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
    expect(
      describeActiveFilters({
        propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        maxBuildingAge: 10,
      }),
    ).toBe("Up to 10 years old");
  });
});

function at(id: string, lat: number, lng: number, extra: Partial<MapListing> = {}): MapListing {
  return { ...home(id, "oneroom"), lat, lng, ...extra };
}

const base = {
  propertyTypes: ["oneroom" as const],
  salesTypes: ["jeonse" as const, "wolse" as const],
  areaBucketIds: [],
  query: "",
  zoom: 14,
};

describe("bubbles follow filters", () => {
  it("rebuilds bubbles only from homes that pass the rent cap", () => {
    const cheap = Array.from({ length: 70 }, (_, i) => at(`c${i}`, 37.556 + i * 1e-5, 126.923, { rent: 20 }));
    const pricey = Array.from({ length: 200 }, (_, i) => at(`p${i}`, 37.557, 126.924 + i * 1e-5, { rent: 90 }));
    const layers = mapLayersForFilters(
      [...cheap, ...pricey],
      [{ id: "server", lat: 37.556, lng: 126.923, count: 270, sources: { zigbang: 270 } }],
      { ...base, maxRent: 30 },
    );
    expect(layers.listings).toHaveLength(70);
    expect(layers.clusters.reduce((sum, c) => sum + c.count, 0)).toBe(70);
    expect(layers.clusters.some((c) => c.id === "server")).toBe(false);
  });

  it("draws nothing when no loaded home matches (no stale server bubble)", () => {
    const layers = mapLayersForFilters(
      [at("a", 37.556, 126.923, { rent: 90 })],
      [{ id: "server", lat: 37.556, lng: 126.923, count: 1, sources: { zigbang: 1 } }],
      { ...base, maxRent: 30 },
    );
    expect(layers).toEqual({ clusters: [], listings: [] });
  });

  it("keeps filtered server bubbles when the home list was capped", () => {
    const server = { id: "server", lat: 37.556, lng: 126.923, count: 500, sources: { zigbang: 500 } };
    const layers = mapLayersForFilters([at("a", 37.556, 126.923, { rent: 20 })], [server], { ...base, maxRent: 30 }, { truncated: true });
    expect(layers.clusters).toEqual([server]);
  });

  it("keeps grouped Naver counts, flagged when filters were ignored, clipped to the radius", () => {
    const near = { ...at("naver:cluster:near", 37.5563, 126.9237, { source: "naver", count: 40 }), unfiltered: true };
    const far = { ...at("naver:cluster:far", 37.6, 127.1, { source: "naver", count: 900 }), unfiltered: true };
    const layers = mapLayersForFilters(
      [at("z", 37.5563, 126.9237, { rent: 20 })],
      [],
      { ...base, circle: { lat: 37.5563, lng: 126.9237, radiusM: 500 } },
      { grouped: [near, far] },
    );
    expect(layers.clusters).toHaveLength(1);
    expect(layers.clusters[0]).toMatchObject({ count: 41, unfilteredCount: 40 });
  });

  it("applies the Ask-style area filters to loaded homes at city zoom", () => {
    const layers = mapLayersForFilters(
      [at("big", 37.556, 126.923, { areaM2: 60 }), at("small", 37.556, 126.923, { areaM2: 15 })],
      [],
      { ...base, areaBucketIds: ["xs"] },
    );
    expect(layers.listings.map((l) => l.id)).toEqual(["small"]);
  });

  it("never draws bubbles at street zoom", () => {
    const layers = mapLayersForFilters([at("a", 37.556, 126.923)], [{ id: "s", lat: 1, lng: 1, count: 9, sources: {} }], { ...base, zoom: 16 });
    expect(layers.clusters).toEqual([]);
    expect(layers.listings).toHaveLength(1);
  });
});

describe("layerSourceCounts", () => {
  it("counts per source from drawn bubbles and flags approximate Naver", () => {
    const counts = layerSourceCounts({
      clusters: [
        { id: "a", lat: 0, lng: 0, count: 15, sources: { zigbang: 5, naver: 10 }, unfilteredCount: 10 },
        { id: "b", lat: 0, lng: 0, count: 3, sources: { peterpan: 3 } },
      ],
      listings: [],
    });
    expect(counts).toMatchObject({ zigbang: 5, naver: 10, peterpan: 3, naverApprox: true });
  });

  it("counts drawn homes and reports server totals only when more exist", () => {
    const counts = layerSourceCounts(
      { clusters: [], listings: [at("a", 1, 1), at("b", 1, 1), at("n", 1, 1, { source: "naver" })] },
      { zigbang: 2, naver: 40, peterpan: 0, naverAvailable: 40 },
    );
    expect(counts).toMatchObject({ zigbang: 2, naver: 1, peterpan: 0, totals: { naver: 40 }, naverApprox: false });
  });

  it("is all zeros when nothing is drawn", () => {
    expect(layerSourceCounts({ clusters: [], listings: [] })).toMatchObject({ zigbang: 0, naver: 0, peterpan: 0 });
  });
});
