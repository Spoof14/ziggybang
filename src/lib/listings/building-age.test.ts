import { describe, expect, it } from "vitest";
import {
  buildingAgeYears,
  describeBuildingAgeFilter,
  listingMatchesBuildingAge,
  normalizeBuildingAgeFilter,
  parseBuiltYear,
} from "./building-age";

describe("building age filter", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("parses Korean approval dates into a build year", () => {
    expect(parseBuiltYear("20180510")).toBe(2018);
    expect(parseBuiltYear("1995.03.12")).toBe(1995);
    expect(parseBuiltYear(undefined)).toBeUndefined();
  });

  it("keeps only buildings at or below the maximum age", () => {
    expect(listingMatchesBuildingAge("20180510", 10, true, now)).toBe(true);
    expect(listingMatchesBuildingAge("20100510", 10, true, now)).toBe(false);
    expect(listingMatchesBuildingAge(undefined, 10, true, now)).toBe(false);
    expect(listingMatchesBuildingAge(undefined, 10, false, now)).toBe(true);
    expect(listingMatchesBuildingAge("20180510", undefined, true, now)).toBe(true);
    expect(buildingAgeYears("20180510", now)).toBe(8);
  });

  it("normalizes and describes the slider value", () => {
    expect(normalizeBuildingAgeFilter({ maxBuildingAge: 10.2 })).toEqual({
      maxBuildingAge: 10,
    });
    expect(normalizeBuildingAgeFilter({ maxBuildingAge: 2 })).toEqual({});
    expect(normalizeBuildingAgeFilter({ maxBuildingAge: 40 })).toEqual({});
    expect(describeBuildingAgeFilter(10)).toBe("Up to 10 years old");
  });
});
