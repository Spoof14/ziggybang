import { describe, expect, it } from "vitest";
import { containsPoint } from "./bounds";
import {
  encodeGeohash,
  geohashBounds,
  geohashCellSize,
  geohashesInBounds,
  precisionForZoom,
} from "./geohash";

describe("geohash", () => {
  it("encodes Seoul City Hall into the wydm tile family", () => {
    const hash = encodeGeohash(37.5665, 126.978, 5);
    expect(hash.startsWith("wydm")).toBe(true);
    expect(hash).toHaveLength(5);
  });

  it("round-trips a point back into its own cell", () => {
    const lat = 37.27845;
    const lng = 126.84993;
    const hash = encodeGeohash(lat, lng, 6);
    const bounds = geohashBounds(hash);
    expect(containsPoint(bounds, lat, lng)).toBe(true);
  });

  it("covers a viewport with a bounded number of tiles", () => {
    const tiles = geohashesInBounds(
      { south: 37.55, west: 126.96, north: 37.58, east: 126.99 },
      6,
      16,
    );
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(16);
    expect(new Set(tiles).size).toBe(tiles.length);
  });

  it("coarsens precision when a viewport would create too many tiles", () => {
    const tiles = geohashesInBounds(
      { south: 37.4, west: 126.7, north: 37.7, east: 127.2 },
      6,
      8,
    );
    expect(tiles.length).toBeLessThanOrEqual(8);
    expect(tiles.every((tile) => tile.length <= 6)).toBe(true);
  });

  it("caps geohash precision at 5 so zoomed-in Zigbang tiles still return listings", () => {
    expect(precisionForZoom(17)).toBe(5);
    expect(precisionForZoom(13)).toBe(5);
    expect(precisionForZoom(10)).toBe(4);
  });

  it("reports a smaller cell as precision increases", () => {
    const coarse = geohashCellSize(4);
    const fine = geohashCellSize(6);
    expect(fine.lat).toBeLessThan(coarse.lat);
    expect(fine.lng).toBeLessThan(coarse.lng);
  });
});
