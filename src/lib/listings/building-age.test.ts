import { describe, expect, it } from "vitest";
import {
  describeBuiltYearFilter,
  listingMatchesBuiltYear,
  normalizeBuiltYearFilter,
  parseBuiltYear,
} from "./building-age";

describe("building age filter", () => {
  it("parses Korean approval dates into a build year", () => {
    expect(parseBuiltYear("20180510")).toBe(2018);
    expect(parseBuiltYear("1995.03.12")).toBe(1995);
    expect(parseBuiltYear(undefined)).toBeUndefined();
  });

  it("keeps only buildings at or above the selected year", () => {
    expect(listingMatchesBuiltYear("20180510", 2015, true)).toBe(true);
    expect(listingMatchesBuiltYear("20100510", 2015, true)).toBe(false);
    expect(listingMatchesBuiltYear(undefined, 2015, true)).toBe(false);
    expect(listingMatchesBuiltYear(undefined, 2015, false)).toBe(true);
    expect(listingMatchesBuiltYear("20180510", undefined, true)).toBe(true);
  });

  it("normalizes and describes the slider value", () => {
    expect(normalizeBuiltYearFilter({ minBuiltYear: 2012.7 })).toEqual({
      minBuiltYear: 2013,
    });
    expect(normalizeBuiltYearFilter({ minBuiltYear: 1800 })).toEqual({});
    expect(describeBuiltYearFilter(2020)).toBe("Built 2020 or newer");
  });
});
