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
