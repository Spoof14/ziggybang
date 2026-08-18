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
    });
    expect(search).toContain("q=hongdae");
    expect(search).toContain("view=list");
    const parsed = parseAppUrl(search);
    expect(parsed.searchInput).toBe("hongdae");
    expect(parsed.viewMode).toBe("list");
    expect(parsed.salesTypes).toEqual(["wolse"]);
    expect(parsed.listSort).toBe("deposit");
    expect(parsed.radiusM).toBe(800);
  });
});
