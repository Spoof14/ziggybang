import { describe, expect, it } from "vitest";
import {
  extractStreetAddress,
  levenshtein,
  matchPlace,
  parseSearchQuery,
  unrefinedPlaceLeftover,
} from "./search";
import { interpretSearch, composeAskIntent } from "./ai-search";
import { type SearchSnapshot } from "./ai-search";

const current: SearchSnapshot = {
  searchInput: "hongdae",
  propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
  salesTypes: ["jeonse"],
  areaBucketIds: [],
  radiusM: 800,
  viewMode: "map",
};

describe("typo tolerance", () => {
  it("counts a transposition as one edit", () => {
    expect(levenshtein("hongdea", "hongdae")).toBe(1);
    expect(levenshtein("gangnm", "gangnam")).toBe(1);
    expect(levenshtein("itaewn", "itaewon")).toBe(1);
  });
  it.each([
    ["hongdea", "hongdae"],
    ["Hongdea", "hongdae"],
    ["gangnm", "gangnam"],
    ["itaewn", "itaewon"],
    ["sinchoon", "sinchon"],
  ])("matches %s to %s", (typo, id) => {
    expect(matchPlace(typo)?.id).toBe(id);
  });
  it("does not leave the typo behind as leftover text", () => {
    const place = matchPlace("studio near Hongdea")!;
    expect(unrefinedPlaceLeftover("Hongdea", place)).toBe("");
    expect(parseSearchQuery("hongdea").place?.id).toBe("hongdae");
    expect(interpretSearch("studio near Hongdea", current).snapshot.searchInput).toBe("hongdae");
  });
  it("does not fuzz unrelated words into places", () => {
    expect(matchPlace("zzzzzz")).toBeUndefined();
  });
});

describe("street addresses in Ask", () => {
  it("extracts the address and keeps its number out of the price", () => {
    expect(extractStreetAddress("서울 마포구 양화로 160")).toBe("서울 마포구 양화로 160");
    const out = interpretSearch("서울 마포구 양화로 160", current);
    expect(out.snapshot.searchInput).toBe("서울 마포구 양화로 160");
    expect(out.snapshot.maxRent).toBeUndefined();
    expect(out.snapshot.maxDeposit).toBeUndefined();
  });
});

describe("fresh Ask keeps stated type and does not inherit a deal type", () => {
  it("keeps villa with a room count and resets the sale type", () => {
    const out = interpretSearch("2 bedroom villa near Itaewon", current).snapshot;
    expect(out.propertyTypes).toEqual(["villa"]);
    expect(out.salesTypes).toEqual(["jeonse", "wolse"]);
    const seoul = interpretSearch("newest buildings under 5 years old near Seoul Station", current).snapshot;
    expect(seoul.salesTypes).toEqual(["jeonse", "wolse"]);
  });
  it("fills type from the parser if the model dropped it", () => {
    const local = interpretSearch("2 bedroom villa near Itaewon", current).intent;
    const composed = composeAskIntent({ searchInput: "Itaewon" }, local, true, "2 bedroom villa near Itaewon");
    expect(composed.propertyTypes).toEqual(["villa"]);
  });
});
