import { describe, expect, it } from "vitest";
import {
  ASK_UI_TTL_MS,
  findPreviewListing,
  hasPreviewHistory,
  parseAskUi,
  parsePreviewKey,
  previewFromSearch,
  previewKey,
  withPreviewParam,
} from "./ask-ui";
import { type MapListing } from "./types";

const ref = { source: "zigbang", propertyType: "oneroom", sourceId: "123" } as const;

describe("ask preview url state", () => {
  it("round-trips a preview key, including ids with colons", () => {
    expect(previewKey(ref)).toBe("zigbang:oneroom:123");
    expect(parsePreviewKey("zigbang:oneroom:123")).toEqual(ref);
    expect(parsePreviewKey("naver:villa:A:B")?.sourceId).toBe("A:B");
  });
  it("rejects malformed keys", () => {
    for (const bad of ["", null, "zigbang", "zigbang:oneroom", "nope:oneroom:1", "zigbang:castle:1", "zigbang:oneroom:"]) {
      expect(parsePreviewKey(bad)).toBeNull();
    }
  });
  it("sets and removes the param while keeping other params", () => {
    const set = withPreviewParam("?lat=37.5&z=14", "zigbang:oneroom:123");
    expect(previewFromSearch(set)).toEqual(ref);
    expect(set).toContain("lat=37.5");
    expect(withPreviewParam(set, null)).toBe("?lat=37.5&z=14");
    expect(withPreviewParam("?preview=zigbang:oneroom:1", null)).toBe("");
  });
  it("finds the pick for a preview ref", () => {
    const picks = [{ listing: { ...ref } as MapListing }, { listing: { ...ref, sourceId: "9" } as MapListing }];
    expect(findPreviewListing(picks, { ...ref, sourceId: "9" })).toBe(picks[1]);
    expect(findPreviewListing(picks, { ...ref, sourceId: "x" })).toBeNull();
    expect(findPreviewListing(picks, null)).toBeNull();
  });
  it("detects the history flag", () => {
    expect(hasPreviewHistory({ ziggybangAskPreview: "k" })).toBe(true);
    expect(hasPreviewHistory({})).toBe(false);
    expect(hasPreviewHistory(null)).toBe(false);
  });
});

describe("ask ui session state", () => {
  const now = 1_000_000;
  it("restores recent state", () => {
    expect(parseAskUi(JSON.stringify({ open: true, index: 4, at: now - 1000 }), now)).toEqual({
      open: true,
      index: 4,
      at: now - 1000,
    });
  });
  it("ignores stale, malformed or missing state and sanitizes the index", () => {
    expect(parseAskUi(JSON.stringify({ open: true, index: 1, at: now - ASK_UI_TTL_MS - 1 }), now)).toBeNull();
    expect(parseAskUi("{", now)).toBeNull();
    expect(parseAskUi(null, now)).toBeNull();
    expect(parseAskUi(JSON.stringify({ open: true, index: -3, at: now }), now)?.index).toBe(0);
    expect(parseAskUi(JSON.stringify({ open: "yes", index: 2, at: now }), now)?.open).toBe(false);
  });
});
