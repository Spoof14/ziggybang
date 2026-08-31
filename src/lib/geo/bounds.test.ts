import { describe, expect, it } from "vitest";
import {
  boundsArea,
  boundsCenter,
  containsPoint,
  expandBounds,
  padBoundsByMeters,
  isUsableMapViewport,
  isValidBounds,
  overlapRatio,
} from "./bounds";

const seoul = {
  south: 37.55,
  west: 126.96,
  north: 37.58,
  east: 126.99,
};

describe("bounds", () => {
  it("rejects inverted or out-of-range boxes", () => {
    expect(isValidBounds(seoul)).toBe(true);
    expect(isValidBounds({ ...seoul, north: 37.5 })).toBe(false);
    expect(isValidBounds({ ...seoul, east: 126.9 })).toBe(false);
    expect(
      isUsableMapViewport({ x: 390, y: 700 }, seoul),
    ).toBe(true);
    expect(isUsableMapViewport({ x: 0, y: 0 }, seoul)).toBe(false);
    expect(
      isUsableMapViewport({ x: 400, y: 400 }, { ...seoul, north: 37.5 }),
    ).toBe(false);
  });

  it("tests point containment and center", () => {
    expect(containsPoint(seoul, 37.566, 126.978)).toBe(true);
    expect(containsPoint(seoul, 37.4, 126.978)).toBe(false);
    expect(boundsCenter(seoul)).toEqual({
      lat: 37.565,
      lng: 126.975,
    });
  });

  it("measures overlap and expansion", () => {
    expect(overlapRatio(seoul, seoul)).toBe(1);
    expect(overlapRatio(seoul, { ...seoul, south: 38 })).toBe(0);
    expect(boundsArea(expandBounds(seoul, 1))).toBeGreaterThan(boundsArea(seoul));
    const padded = padBoundsByMeters(seoul, 800);
    expect(padded.south).toBeLessThan(seoul.south);
    expect(padded.north).toBeGreaterThan(seoul.north);
  });
});
