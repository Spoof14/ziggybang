import { afterEach, describe, expect, it } from "vitest";
import { loadPrefs, savePrefs } from "./prefs";

const memory = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  clear: () => memory.clear(),
};

Object.defineProperty(globalThis, "window", {
  value: { localStorage: localStorageMock },
  configurable: true,
});

describe("saved map prefs", () => {
  afterEach(() => {
    memory.clear();
  });

  it("round-trips filters, search, and a drawn area", () => {
    savePrefs({
      sources: ["zigbang"],
      propertyTypes: ["oneroom"],
      salesTypes: ["wolse"],
      areaBucketIds: ["s"],
      searchInput: "hongdae",
      viewMode: "list",
      radiusM: 800,
      circle: { lat: 37.556, lng: 126.923, radiusM: 800 },
      polygon: null,
      view: { lat: 37.556, lng: 126.923, zoom: 15 },
      uiCompact: true,
      listSort: "deposit",
      maxDeposit: 2000,
      maxRent: 80,
      foreignerOk: true,
      floorFilter: "no-basement",
    });

    expect(loadPrefs()).toMatchObject({
      sources: ["zigbang"],
      searchInput: "hongdae",
      viewMode: "list",
      radiusM: 800,
      circle: { lat: 37.556, lng: 126.923, radiusM: 800 },
      view: { lat: 37.556, lng: 126.923, zoom: 15 },
      uiCompact: true,
      listSort: "deposit",
      maxDeposit: 2000,
      maxRent: 80,
      foreignerOk: true,
      floorFilter: "no-basement",
    });
  });

  it("drops unknown filter values instead of crashing", () => {
    memory.set(
      "ziggybang:prefs:v1",
      JSON.stringify({
        sources: ["craigslist"],
        propertyTypes: ["oneroom", "castle"],
        salesTypes: ["wolse"],
        searchInput: "hongdae",
        viewMode: "satellite",
        radiusM: 99999,
      }),
    );

    const prefs = loadPrefs();
    expect(prefs?.propertyTypes).toEqual(["oneroom"]);
    expect(prefs?.viewMode).toBe("map");
    expect(prefs?.radiusM).toBe(3000);
  });
});
