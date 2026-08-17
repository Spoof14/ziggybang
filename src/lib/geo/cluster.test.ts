import { describe, expect, it } from "vitest";
import { type MapListing } from "~/lib/listings/types";
import { cellSizeForZoom, clusterListings, shouldCluster } from "./cluster";

function listing(
  id: string,
  lat: number,
  lng: number,
  source: MapListing["source"] = "zigbang",
  count = 1,
): MapListing {
  return {
    id,
    source,
    sourceId: id,
    lat,
    lng,
    propertyType: "oneroom",
    url: "https://example.com",
    count,
  };
}

describe("cluster", () => {
  it("clusters nearby points and keeps distant ones separate", () => {
    const clusters = clusterListings(
      [
        listing("a", 37.5, 127.0),
        listing("b", 37.5001, 127.0001),
        listing("c", 37.7, 127.2),
      ],
      0.01,
    );

    expect(clusters).toHaveLength(2);
    const dense = clusters.find((cluster) => cluster.count === 2);
    expect(dense?.sources.zigbang).toBe(2);
  });

  it("weights apartment complexes by listing count", () => {
    const [cluster] = clusterListings(
      [listing("apt", 37.5, 127.0, "zigbang", 10), listing("unit", 37.5, 127.0)],
      0.01,
    );
    expect(cluster?.count).toBe(11);
  });

  it("merges source counts from Zigbang and Naver", () => {
    const [cluster] = clusterListings(
      [
        listing("z", 37.5, 127.0, "zigbang"),
        listing("n", 37.5, 127.0, "naver"),
      ],
      0.01,
    );
    expect(cluster?.sources).toEqual({ zigbang: 1, naver: 1 });
  });

  it("clusters when zoomed out or when there are too many markers", () => {
    expect(shouldCluster(12, 10)).toBe(true);
    expect(shouldCluster(16, 10)).toBe(false);
    expect(shouldCluster(16, 500)).toBe(false);
  });

  it("uses a finer grid at higher zoom", () => {
    expect(cellSizeForZoom(16)).toBeLessThan(cellSizeForZoom(12));
  });
});
