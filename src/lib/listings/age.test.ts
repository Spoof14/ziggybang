import { describe, expect, it } from "vitest";
import {
  formatRelativeListed,
  listingAgeTone,
  listingMatchesAge,
  parseAgeFilter,
} from "./age";

const now = Date.parse("2026-08-20T12:00:00Z");

describe("listing age", () => {
  it("reads this-week and this-month phrasing out of a search", () => {
    expect(parseAgeFilter("hongdae this week").ageFilter).toBe("week");
    expect(parseAgeFilter("hongdae this week").rest.toLowerCase()).toContain("hongdae");
    expect(parseAgeFilter("new listings near dangsan").ageFilter).toBe("week");
    expect(parseAgeFilter("listed this month in yeonnam").ageFilter).toBe("month");
  });

  it("colors listings by recency", () => {
    expect(listingAgeTone("20260818", now)).toBe("fresh");
    expect(listingAgeTone("2026-08-01 10:00:00", now)).toBe("recent");
    expect(listingAgeTone("2026-06-01 10:00:00", now)).toBe("stale");
    expect(listingAgeTone(undefined, now)).toBeUndefined();
  });

  it("keeps only listings within the selected age window", () => {
    expect(listingMatchesAge("2026-08-18 10:00:00", "week", true, now)).toBe(true);
    expect(listingMatchesAge("2026-08-01 10:00:00", "week", true, now)).toBe(false);
    expect(listingMatchesAge("2026-08-01 10:00:00", "month", true, now)).toBe(true);
    expect(listingMatchesAge("2026-06-01 10:00:00", "month", true, now)).toBe(false);
    expect(listingMatchesAge(undefined, "week", true, now)).toBe(false);
    expect(listingMatchesAge(undefined, "week", false, now)).toBe(true);
  });

  it("describes how old a listing is", () => {
    expect(formatRelativeListed("2026-08-20 08:00:00", now)).toBe("today");
    expect(formatRelativeListed("2026-08-17 12:00:00", now)).toBe("3 days ago");
    expect(formatRelativeListed("2026-08-06 12:00:00", now)).toBe("2 weeks ago");
    expect(formatRelativeListed("2026-06-20 12:00:00", now)).toBe("2 months ago");
  });
});
