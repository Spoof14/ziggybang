import { describe, expect, it } from "vitest";
import { leafletBasemap } from "./basemap";

describe("leafletBasemap", () => {
  it("uses Esri street tiles when no CARTO key is set", () => {
    const previous = process.env.NEXT_PUBLIC_CARTO_API_KEY;
    delete process.env.NEXT_PUBLIC_CARTO_API_KEY;
    try {
      const tiles = leafletBasemap();
      expect(tiles.url).toContain("arcgisonline.com");
      expect(tiles.url).not.toContain("key=");
    } finally {
      if (previous !== undefined) process.env.NEXT_PUBLIC_CARTO_API_KEY = previous;
    }
  });

  it("switches to CARTO Voyager when a key is present", () => {
    const previous = process.env.NEXT_PUBLIC_CARTO_API_KEY;
    process.env.NEXT_PUBLIC_CARTO_API_KEY = "test-key";
    try {
      const tiles = leafletBasemap();
      expect(tiles.url).toContain("basemaps.cartocdn.com");
      expect(tiles.url).toContain("key=test-key");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_CARTO_API_KEY;
      else process.env.NEXT_PUBLIC_CARTO_API_KEY = previous;
    }
  });
});
