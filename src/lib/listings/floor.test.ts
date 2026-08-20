import { describe, expect, it } from "vitest";
import {
  floorNumber,
  isBasementFloor,
  listingMatchesFloor,
  parseFloorFilter,
} from "./floor";

describe("floor filters", () => {
  it("reads no-basement phrasing out of a search", () => {
    expect(parseFloorFilter("hongdae no basement").floorFilter).toBe("no-basement");
    expect(parseFloorFilter("hongdae no basement").rest.toLowerCase()).toContain("hongdae");
    expect(parseFloorFilter("guro digital 2F+").floorFilter).toBe("min-2");
    expect(parseFloorFilter("high floor near dangsan").floorFilter).toBe("min-5");
  });

  it("detects Korean basement floors", () => {
    expect(isBasementFloor("반지하/3")).toBe(true);
    expect(isBasementFloor("B1/4")).toBe(true);
    expect(isBasementFloor("3/5")).toBe(false);
    expect(isBasementFloor("옥탑/4")).toBe(false);
    expect(floorNumber("2층/5층")).toBe(2);
    expect(floorNumber("고/12")).toBe(8);
  });

  it("excludes basements for no-basement and 2F+", () => {
    expect(listingMatchesFloor("반지하/3", "no-basement", true)).toBe(false);
    expect(listingMatchesFloor("3/5", "no-basement", true)).toBe(true);
    expect(listingMatchesFloor("1/4", "min-2", true)).toBe(false);
    expect(listingMatchesFloor("2/5", "min-2", true)).toBe(true);
    expect(listingMatchesFloor("고/12", "min-5", true)).toBe(true);
    expect(listingMatchesFloor(undefined, "no-basement", true)).toBe(false);
    expect(listingMatchesFloor(undefined, "no-basement", false)).toBe(true);
  });
});
