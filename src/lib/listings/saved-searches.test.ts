import { afterEach, describe, expect, it } from "vitest";
import {
  addSavedSearch,
  defaultSavedSearchName,
  deleteSavedSearch,
  loadSavedSearches,
  normalizeSavedSearchQuery,
  renameSavedSearch,
  saveSavedSearches,
} from "./saved-searches";

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

describe("saved searches", () => {
  afterEach(() => memory.clear());

  it("strips language and preview params from stored queries", () => {
    expect(normalizeSavedSearchQuery("?lat=37&lng=127&lang=ko&preview=1")).toBe("?lat=37&lng=127");
  });

  it("adds, renames, and deletes saved searches", () => {
    addSavedSearch({ name: "Gangnam", search: "?lat=37.5&lng=127" });
    expect(loadSavedSearches()).toHaveLength(1);
    renameSavedSearch(loadSavedSearches()[0]!.id, "Gangnam jeonse");
    expect(loadSavedSearches()[0]?.name).toBe("Gangnam jeonse");
    deleteSavedSearch(loadSavedSearches()[0]!.id);
    expect(loadSavedSearches()).toHaveLength(0);
  });

  it("dedupes identical search strings on save", () => {
    addSavedSearch({ name: "One", search: "?lat=1&lng=2" });
    addSavedSearch({ name: "Two", search: "?lat=1&lng=2" });
    expect(loadSavedSearches()).toHaveLength(1);
    expect(loadSavedSearches()[0]?.name).toBe("Two");
  });

  it("builds a default name from chips or a numbered fallback", () => {
    expect(defaultSavedSearchName({ chips: ["Naver", "Jeonse"], index: 0 }, "en")).toBe("Naver · Jeonse");
    expect(defaultSavedSearchName({ chips: [], index: 2 }, "en")).toContain("3");
  });

  it("persists through saveSavedSearches", () => {
    saveSavedSearches([
      { id: "a", name: "Test", search: "?lat=1", savedAt: 1 },
    ]);
    expect(loadSavedSearches()[0]?.name).toBe("Test");
  });
});