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
        expect(data.listings.some((item) => item.thumbnail)).toBe(true);
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
    12000,
  );

  it(
    "keeps Hongdae radius results near Hongdae, not Gangnam",
    async () => {
      const data = await getMapData({
        bounds: gangnam,
        zoom: 13,
        sources: ["zigbang"],
        propertyTypes: ["oneroom", "officetel"],
        circle: { lat: 37.556, lng: 126.923, radiusM: 1200 },
        includeListings: true,
      });

      expect(data.errors).toEqual([]);
      expect(data.mode).toBe("markers");
      expect(data.listings.length).toBeGreaterThan(0);
      expect(
        data.listings.every(
          (item) =>
            Math.abs(item.lat - 37.556) < 0.02 &&
            Math.abs(item.lng - 126.923) < 0.02,
        ),
      ).toBe(true);
      expect(data.listings.some((item) => item.lat < 37.52)).toBe(false);
    },
    30000,
  );

  it(
    "keeps Dangsan radius results near Dangsan",
    async () => {
      const data = await getMapData({
        bounds: gangnam,
        zoom: 15,
        sources: ["zigbang"],
        propertyTypes: ["oneroom", "officetel", "villa"],
        circle: { lat: 37.5346, lng: 126.9025, radiusM: 1200 },
        includeListings: true,
      });

      expect(data.errors).toEqual([]);
      expect(data.listings.length).toBeGreaterThan(0);
      expect(
        data.listings.every(
          (item) =>
            Math.abs(item.lat - 37.5346) < 0.02 &&
            Math.abs(item.lng - 126.9025) < 0.02,
        ),
      ).toBe(true);
    },
    30000,
  );

  it(
    "loads Peterpan listings for a Gangnam viewport",
    async () => {
      const data = await getMapData({
        bounds: gangnam,
        zoom: 16,
        sources: ["peterpan"],
        propertyTypes: ["villa", "oneroom", "officetel"],
        includeListings: true,
      });

      expect(data.errors).toEqual([]);
      expect(data.stats.peterpan).toBeGreaterThan(0);
      expect(data.listings[0]?.source).toBe("peterpan");
      expect(data.listings[0]?.thumbnail).toBeTruthy();
    },
    30000,
  );
});
