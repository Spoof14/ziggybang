import { describe, expect, it } from "vitest";
import { type MapData } from "./types";
import { mergeMapData } from "./merge";

const zigbang: MapData = {
  mode: "clusters",
  clusters: [
    {
      id: "c1",
      lat: 37.5,
      lng: 127,
      count: 17,
      sources: { zigbang: 17 },
    },
  ],
  listings: [],
  stats: { zigbang: 17, naver: 0, returned: 1, truncated: false },
  errors: [],
};

const naverError: MapData = {
  mode: "clusters",
  clusters: [],
  listings: [],
  stats: { zigbang: 0, naver: 0, returned: 0, truncated: false },
  errors: [{ source: "naver", message: "Naver timed out" }],
};

describe("mergeMapData", () => {
  it("keeps Zigbang clusters when Naver is still loading", () => {
    const merged = mergeMapData([zigbang, undefined]);
    expect(merged.clusters).toHaveLength(1);
    expect(merged.stats.zigbang).toBe(17);
    expect(merged.errors).toEqual([]);
  });

  it("appends a compact Naver error without dropping Zigbang", () => {
    const merged = mergeMapData([zigbang, naverError]);
    expect(merged.clusters).toHaveLength(1);
    expect(merged.errors).toHaveLength(1);
  });
});
