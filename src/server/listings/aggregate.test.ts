import { describe, expect, it } from "vitest";
import { type MapListing } from "~/lib/listings/types";
import { getMapData } from "./aggregate";

function listing(
  id: string,
  source: MapListing["source"],
  lat = 37.566,
  lng = 126.978,
): MapListing {
  return {
    id,
    source,
    sourceId: id,
    lat,
    lng,
    propertyType: "oneroom",
    url: "https://example.com",
  };
}

const seoulBounds = {
  south: 37.55,
  west: 126.96,
  north: 37.58,
  east: 126.99,
};

describe("getMapData", () => {
  it("merges both sources and clusters when zoomed out", async () => {
    const data = await getMapData(
      {
        bounds: seoulBounds,
        zoom: 12,
        sources: ["zigbang", "naver"],
        propertyTypes: ["oneroom"],
      },
      {
        zigbang: async () => [listing("z1", "zigbang"), listing("z2", "zigbang")],
        naver: async () => [listing("n1", "naver")],
      },
    );

    expect(data.mode).toBe("clusters");
    expect(data.stats.zigbang).toBe(2);
    expect(data.stats.naver).toBe(1);
    expect(data.clusters[0]?.count).toBe(3);
    expect(data.listings).toHaveLength(0);
  });

  it("returns individual markers when zoomed in", async () => {
    const data = await getMapData(
      {
        bounds: seoulBounds,
        zoom: 16,
        sources: ["zigbang"],
        propertyTypes: ["oneroom"],
      },
      {
        zigbang: async () => [listing("z1", "zigbang"), listing("z1", "zigbang")],
        naver: async () => [listing("n1", "naver")],
      },
    );

    expect(data.mode).toBe("markers");
    expect(data.listings).toHaveLength(1);
    expect(data.stats.naver).toBe(0);
  });

  it("keeps the other source if Naver fails", async () => {
    const data = await getMapData(
      {
        bounds: seoulBounds,
        zoom: 16,
        sources: ["zigbang", "naver"],
        propertyTypes: ["villa"],
      },
      {
        zigbang: async () => [listing("z1", "zigbang")],
        naver: async () => {
          throw new Error("Timed out fetching https://m.land.naver.com");
        },
      },
    );

    expect(data.listings).toHaveLength(1);
    expect(data.errors).toEqual([
      {
        source: "naver",
        message: "Timed out fetching https://m.land.naver.com",
      },
    ]);
  });

  it("does not wait on a hanging Naver request", async () => {
    const started = Date.now();
    const data = await getMapData(
      {
        bounds: seoulBounds,
        zoom: 16,
        sources: ["zigbang", "naver"],
        propertyTypes: ["oneroom"],
      },
      {
        zigbang: async () => [listing("z1", "zigbang")],
        naver: async () =>
          new Promise(() => {
            /* hang */
          }),
      },
    );
    expect(Date.now() - started).toBeLessThan(4000);
    expect(data.listings).toHaveLength(1);
    expect(data.errors[0]?.source).toBe("naver");
  }, 5000);

  it("filters to matching sales types once listings have that data", async () => {
    const data = await getMapData(
      {
        bounds: seoulBounds,
        zoom: 16,
        sources: ["zigbang"],
        propertyTypes: ["oneroom"],
        salesTypes: ["jeonse"],
      },
      {
        zigbang: async () => [
          { ...listing("z1", "zigbang"), salesType: "jeonse" },
          { ...listing("z2", "zigbang"), salesType: "wolse" },
        ],
        naver: async () => [],
      },
    );

    expect(data.listings.map((item) => item.id)).toEqual(["z1"]);
  });

  it("filters by size bucket and bilingual search text", async () => {
    const data = await getMapData(
      {
        bounds: seoulBounds,
        zoom: 16,
        sources: ["zigbang"],
        propertyTypes: ["oneroom"],
        query: "yeonnam studio",
        areaBucketIds: ["s"],
      },
      {
        zigbang: async () => [
          {
            ...listing("z1", "zigbang"),
            address: "서울 마포구 연남동",
            areaM2: 26,
            propertyType: "oneroom",
          },
          {
            ...listing("z2", "zigbang"),
            address: "서울 강남구 역삼동",
            areaM2: 80,
            propertyType: "villa",
          },
        ],
        naver: async () => [],
      },
    );

    expect(data.listings.map((item) => item.id)).toEqual(["z1"]);
  });

  it("keeps only listings inside a Hongdae radius", async () => {
    const data = await getMapData(
      {
        bounds: seoulBounds,
        zoom: 13,
        sources: ["zigbang"],
        propertyTypes: ["oneroom"],
        query: "hongdae",
        circle: { lat: 37.556, lng: 126.923, radiusM: 1000 },
        includeListings: true,
      },
      {
        zigbang: async () => [
          { ...listing("near", "zigbang"), lat: 37.5565, lng: 126.922 },
          { ...listing("far", "zigbang"), lat: 37.498, lng: 127.028 },
        ],
        naver: async () => [],
      },
    );

    expect(data.listings.map((item) => item.id)).toEqual(["near"]);
  });

  it("rejects invalid bounds", async () => {
    await expect(
      getMapData({
        bounds: { south: 38, west: 126, north: 37, east: 127 },
        zoom: 13,
        sources: ["zigbang"],
        propertyTypes: ["oneroom"],
      }),
    ).rejects.toThrow("Invalid map bounds");
  });
});
