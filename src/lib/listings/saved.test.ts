import { afterEach, describe, expect, it } from "vitest";
import { isSavedHome, loadSavedHomes, saveSavedHomes, toggleSavedHome } from "./saved";
import { type MapListing } from "./types";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    },
  },
  configurable: true,
});

const home: MapListing = {
  id: "zigbang:1",
  source: "zigbang",
  sourceId: "1",
  lat: 37.5,
  lng: 127,
  propertyType: "oneroom",
  url: "https://example.com",
};

describe("saved homes", () => {
  afterEach(() => memory.clear());

  it("toggles a listing in and out of the saved list", () => {
    const saved = toggleSavedHome([], home);
    expect(isSavedHome(saved, home.id)).toBe(true);
    saveSavedHomes(saved);
    expect(loadSavedHomes()[0]?.id).toBe(home.id);
    expect(toggleSavedHome(saved, home)).toEqual([]);
  });
});
