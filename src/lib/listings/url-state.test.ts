import { describe, expect, it } from "vitest";
import { buildAppSearch, parseAppUrl } from "./url-state";

describe("shareable search URLs", () => {
  it("round-trips a Hongdae monthly list view", () => {
    const search = buildAppSearch({
      searchInput: "hongdae",
      viewMode: "list",
      sources: ["zigbang", "peterpan"],
      propertyTypes: ["oneroom"],
      salesTypes: ["wolse"],
      areaBucketIds: ["s"],
      radiusM: 800,
      view: { lat: 37.556, lng: 126.923, zoom: 15 },
      listSort: "deposit",
      maxDeposit: 2000,
      maxRent: 80,
    });
    expect(search).toContain("q=hongdae");
    expect(search).toContain("view=list");
    expect(search).toContain("dmax=2000");
    expect(search).toContain("rmax=80");
    expect(search).not.toContain("ok=1");
    const parsed = parseAppUrl(search);
    expect(parsed.searchInput).toBe("hongdae");
    expect(parsed.viewMode).toBe("list");
    expect(parsed.salesTypes).toEqual(["wolse"]);
    expect(parsed.listSort).toBe("deposit");
    expect(parsed.radiusM).toBe(800);
    expect(parsed.maxDeposit).toBe(2000);
    expect(parsed.maxRent).toBe(80);
  });

  it("round-trips the Best view", () => {
    const search = buildAppSearch({
      searchInput: "hongdae",
      viewMode: "best",
      sources: ["zigbang", "peterpan"],
      propertyTypes: ["oneroom"],
      salesTypes: ["wolse"],
      areaBucketIds: [],
      radiusM: 800,
      view: { lat: 37.556, lng: 126.923, zoom: 16 },
      listSort: "featured",
    });
    expect(search).toContain("view=best");
    expect(parseAppUrl(search).viewMode).toBe("best");
  });

  it("round-trips the foreigners-welcome chip", () => {
    const search = buildAppSearch({
      searchInput: "hongdae",
      viewMode: "map",
      sources: ["zigbang", "peterpan"],
      propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
      salesTypes: ["jeonse", "wolse"],
      areaBucketIds: [],
      radiusM: 1200,
      view: { lat: 37.556, lng: 126.923, zoom: 15 },
      listSort: "featured",
      foreignerOk: true,
    });
    expect(search).toContain("ok=1");
    expect(parseAppUrl(search).foreignerOk).toBe(true);
  });

  it("round-trips the no-basement floor chip", () => {
    const search = buildAppSearch({
      searchInput: "guro digital",
      viewMode: "map",
      sources: ["zigbang", "peterpan"],
      propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
      salesTypes: ["jeonse", "wolse"],
      areaBucketIds: [],
      radiusM: 800,
      view: { lat: 37.4852, lng: 126.9014, zoom: 16 },
      listSort: "featured",
      floorFilter: "no-basement",
    });
    expect(search).toContain("floor=nb");
    expect(parseAppUrl(search).floorFilter).toBe("no-basement");
  });

  it("round-trips the max building-age slider", () => {
    const search = buildAppSearch({
      searchInput: "hongdae",
      viewMode: "map",
      sources: ["zigbang", "peterpan"],
      propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
      salesTypes: ["jeonse", "wolse"],
      areaBucketIds: [],
      radiusM: 800,
      view: { lat: 37.556, lng: 126.923, zoom: 15 },
      listSort: "featured",
      maxBuildingAge: 10,
    });
    expect(search).toContain("maxage=10");
    expect(parseAppUrl(search).maxBuildingAge).toBe(10);
  });

  it("round-trips the this-week age chip", () => {
    const search = buildAppSearch({
      searchInput: "hongdae",
      viewMode: "map",
      sources: ["zigbang", "peterpan"],
      propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
      salesTypes: ["jeonse", "wolse"],
      areaBucketIds: [],
      radiusM: 800,
      view: { lat: 37.556, lng: 126.923, zoom: 15 },
      listSort: "featured",
      ageFilter: "week",
    });
    expect(search).toContain("age=7");
    expect(parseAppUrl(search).ageFilter).toBe("week");
  });
});
