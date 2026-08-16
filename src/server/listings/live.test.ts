import { describe, expect, it } from "vitest";
import { getMapData } from "./aggregate";
import { fetchZigbangDetail } from "./zigbang";

const gangnam = {
  south: 37.493,
  west: 127.02,
  north: 37.505,
  east: 127.035,
};

describe("live aggregator", () => {
  it(
    "loads Zigbang markers for a Gangnam viewport",
    async () => {
      const data = await getMapData({
        bounds: gangnam,
        zoom: 16,
        sources: ["zigbang"],
        propertyTypes: ["oneroom", "officetel"],
      });

      expect(data.errors).toEqual([]);
      expect(data.stats.zigbang).toBeGreaterThan(0);
      expect(data.mode === "markers" ? data.listings : data.clusters).not.toHaveLength(0);
      if (data.mode === "markers") {
        expect(data.listings.every((item) => item.source === "zigbang")).toBe(true);
        expect(
          data.listings.every(
            (item) =>
              item.lat >= gangnam.south &&
              item.lat <= gangnam.north &&
              item.lng >= gangnam.west &&
              item.lng <= gangnam.east,
          ),
        ).toBe(true);
      }
    },
    30000,
  );

  it(
    "loads a Zigbang listing detail",
    async () => {
      const data = await getMapData({
        bounds: gangnam,
        zoom: 16,
        sources: ["zigbang"],
        propertyTypes: ["oneroom"],
      });
      const sample = data.listings[0] ?? null;
      if (!sample) {
        expect(data.stats.zigbang).toBeGreaterThan(0);
        return;
      }
      const detail = await fetchZigbangDetail(sample.sourceId, sample.propertyType);
      expect(detail.sourceId).toBe(sample.sourceId);
      expect(detail.url).toContain(sample.sourceId);
    },
    30000,
  );

  it(
    "records a Naver error instead of failing the whole map",
    async () => {
      const data = await getMapData({
        bounds: gangnam,
        zoom: 13,
        sources: ["naver"],
        propertyTypes: ["apartment"],
      });
      if (data.stats.naver > 0) {
        expect(data.errors).toEqual([]);
      } else {
        expect(data.errors.some((error) => error.source === "naver")).toBe(true);
      }
    },
    20000,
  );
});
