import { describe, expect, it } from "vitest";
import {
  boundsAroundCircle,
  distanceM,
  listingInArea,
  pointInCircle,
  pointInPolygon,
} from "./shape";

describe("map shapes", () => {
  it("keeps Hongdae points inside a 1 km circle and drops Gangnam", () => {
    const hongdae = { lat: 37.556, lng: 126.923, radiusM: 1000 };
    expect(pointInCircle({ lat: 37.5565, lng: 126.922 }, hongdae)).toBe(true);
    expect(pointInCircle({ lat: 37.498, lng: 127.028 }, hongdae)).toBe(false);
    expect(distanceM(hongdae, { lat: 37.498, lng: 127.028 })).toBeGreaterThan(5000);
  });

  it("builds fetch bounds that cover the circle", () => {
    const bounds = boundsAroundCircle({ lat: 37.556, lng: 126.923, radiusM: 1000 });
    expect(bounds.south).toBeLessThan(37.556);
    expect(bounds.north).toBeGreaterThan(37.556);
    expect(bounds.west).toBeLessThan(126.923);
    expect(bounds.east).toBeGreaterThan(126.923);
  });

  it("detects a point inside a drawn polygon", () => {
    const square = [
      { lat: 37.55, lng: 126.91 },
      { lat: 37.56, lng: 126.91 },
      { lat: 37.56, lng: 126.93 },
      { lat: 37.55, lng: 126.93 },
    ];
    expect(pointInPolygon({ lat: 37.555, lng: 126.92 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 37.57, lng: 126.95 }, square)).toBe(false);
    expect(listingInArea({ lat: 37.555, lng: 126.92 }, undefined, square)).toBe(true);
  });
});
