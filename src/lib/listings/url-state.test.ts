import { describe, expect, it } from "vitest";
import { buildAppSearch, parseAppUrl, prefsForInitialState } from "./url-state";

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

  it("round-trips the has-photos chip", () => {
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
      hasPhotos: true,
    });
    expect(search).toContain("pics=1");
    expect(parseAppUrl(search).hasPhotos).toBe(true);
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

describe("prefsForInitialState", () => {
  const saved = { uiCompact: true, viewMode: "list", maxDeposit: 500 };
  it("a bare load starts from defaults: only the compact-UI choice survives", () => {
    expect(prefsForInitialState("", saved)).toEqual({ uiCompact: true });
    expect(prefsForInitialState("?utm_source=x", saved)).toEqual({ uiCompact: true });
  });
  it("lets the URL win: stored filters/view mode are dropped", () => {
    expect(prefsForInitialState("?lat=37.5&lng=127&z=13", saved)).toEqual({
      uiCompact: true,
    });
  });
  it("returns null without stored prefs", () => {
    expect(prefsForInitialState("?view=list", null)).toBeNull();
  });
});

describe("manual radius and type aliases", () => {
  const base = {
    searchInput: "",
    viewMode: "map" as const,
    sources: ["zigbang", "naver", "peterpan"] as ("zigbang" | "naver" | "peterpan")[],
    propertyTypes: ["oneroom", "villa", "officetel", "apartment"] as (
      | "oneroom"
      | "villa"
      | "officetel"
      | "apartment"
    )[],
    salesTypes: ["jeonse", "wolse", "sale"] as ("jeonse" | "wolse" | "sale")[],
    areaBucketIds: [],
    radiusM: 1200,
    view: { lat: 37.565, lng: 126.98, zoom: 14 },
    listSort: "featured" as const,
  };

  it("persists a manual radius center and radius, even at the default size", () => {
    const search = buildAppSearch({
      ...base,
      circleCenter: { lat: 37.55612, lng: 126.92345 },
    });
    expect(search).toContain("r=1200");
    expect(search).toContain("rlat=37.55612");
    expect(search).toContain("rlng=126.92345");
    const parsed = parseAppUrl(search);
    expect(parsed.circleCenter).toEqual({ lat: 37.55612, lng: 126.92345 });
    expect(parsed.radiusM).toBe(1200);
  });

  it("omits radius params when there is no manual circle", () => {
    const search = buildAppSearch({ ...base, circleCenter: null });
    expect(search).not.toContain("rlat");
    expect(search).not.toContain("r=");
  });

  it("ignores a half-specified or invalid circle center", () => {
    expect(parseAppUrl("?rlat=37.5").circleCenter).toBeUndefined();
    expect(parseAppUrl("?rlat=abc&rlng=127").circleCenter).toBeUndefined();
    expect(parseAppUrl("?rlat=200&rlng=127").circleCenter).toBeUndefined();
  });

  it("accepts property type aliases", () => {
    expect(parseAppUrl("?type=apt").propertyTypes).toEqual(["apartment"]);
    expect(parseAppUrl("?type=Studio,one-room").propertyTypes).toEqual(["oneroom"]);
    expect(parseAppUrl("?type=apt,villa,bogus,apartment").propertyTypes).toEqual([
      "apartment",
      "villa",
    ]);
    expect(parseAppUrl("?type=oneroom,officetel").propertyTypes).toEqual([
      "oneroom",
      "officetel",
    ]);
    expect(parseAppUrl("?type=bogus").propertyTypes).toBeUndefined();
  });
});

describe("URL reflects the current view and radius", () => {
  const view = { lat: 37.498, lng: 127.0276, zoom: 15 };
  const common = {
    searchInput: "gangnam",
    viewMode: "map" as const,
    sources: ["zigbang"] as ("zigbang" | "naver" | "peterpan")[],
    propertyTypes: ["oneroom", "villa", "officetel", "apartment"] as (
      | "oneroom"
      | "villa"
      | "officetel"
      | "apartment"
    )[],
    salesTypes: ["jeonse", "wolse", "sale"] as ("jeonse" | "wolse" | "sale")[],
    areaBucketIds: [],
    listSort: "featured" as const,
  };

  it("writes the exact lat/lng/zoom it is given, including fractional zoom", () => {
    const search = buildAppSearch({ ...common, radiusM: 1200, view: { ...view, zoom: 15.37 } });
    expect(search).toContain("lat=37.4980");
    expect(search).toContain("lng=127.0276");
    expect(search).toContain("z=15.37");
    const parsed = parseAppUrl(search);
    expect(parsed.view).toEqual({ lat: 37.498, lng: 127.0276, zoom: 15.37 });
  });

  it("drops r, rlat and rlng once the radius is no longer active", () => {
    const withRadius = buildAppSearch({ ...common, radiusM: 800, view });
    expect(withRadius).toContain("r=800");
    const cleared = buildAppSearch({ ...common, radiusM: 800, radiusActive: false, view });
    expect(cleared).not.toContain("r=800");
    expect(cleared).not.toContain("rlat");
    expect(cleared).not.toContain("rlng");
  });

  it("keeps a manual circle even if radiusActive is false", () => {
    const search = buildAppSearch({
      ...common,
      radiusM: 500,
      radiusActive: false,
      circleCenter: { lat: 37.5, lng: 127 },
      view,
    });
    expect(search).toContain("r=500");
    expect(search).toContain("rlat=37.50000");
  });
});
