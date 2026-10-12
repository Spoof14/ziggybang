import { describe, expect, it } from "vitest";
import { sampleAcrossBounds } from "./sample";

// Viewport of https://ziggybang.vercel.app/?src=peterpan&lat=37.5627&lng=126.8425&z=14
const VIEW = { south: 37.532, north: 37.593, west: 126.78, east: 126.905 };

describe("sampleAcrossBounds", () => {
  it("does not keep only the first (southern) items when capping", () => {
    const items = Array.from({ length: 684 }, (_, i) => ({
      id: i,
      lat: VIEW.south + ((VIEW.north - VIEW.south) * i) / 683,
      lng: VIEW.west + ((VIEW.east - VIEW.west) * ((i * 37) % 684)) / 683,
    }));
    const naive = items.slice(0, 240);
    const fair = sampleAcrossBounds(items, 240, VIEW);
    expect(fair).toHaveLength(240);
    expect(Math.max(...naive.map((i) => i.lat))).toBeLessThan(37.56);
    expect(Math.max(...fair.map((i) => i.lat))).toBeGreaterThan(37.58);
    expect(Math.min(...fair.map((i) => i.lat))).toBeLessThan(37.535);
  });

  it("keeps sparse areas and original order", () => {
    const dense = Array.from({ length: 50 }, (_, i) => ({ lat: 37.533, lng: 126.79 + i * 1e-5 }));
    const lone = { lat: 37.59, lng: 126.9 };
    const out = sampleAcrossBounds([...dense, lone], 5, VIEW);
    expect(out).toHaveLength(5);
    expect(out).toContain(lone);
    expect(out[out.length - 1]).toBe(lone);
  });

  it("returns the input untouched under the cap", () => {
    const items = [{ lat: 37.54, lng: 126.8 }];
    expect(sampleAcrossBounds(items, 5, VIEW)).toBe(items);
  });
});
