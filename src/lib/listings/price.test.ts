import { describe, expect, it } from "vitest";
import {
  describePriceFilter,
  isEmptyPriceFilter,
  listingMatchesPrice,
  normalizePriceFilter,
  parseOptionalManwon,
} from "./price";

describe("price filters", () => {
  it("swaps inverted min/max and drops junk", () => {
    expect(
      normalizePriceFilter({
        minDeposit: 2000,
        maxDeposit: 500,
        minRent: -1,
        maxRent: 80.4,
      }),
    ).toEqual({ minDeposit: 500, maxDeposit: 2000, maxRent: 80 });
    expect(isEmptyPriceFilter({})).toBe(true);
    expect(parseOptionalManwon(" 2,000 ")).toBe(2000);
    expect(parseOptionalManwon("")).toBeUndefined();
  });

  it("keeps unpriced listings until details are required", () => {
    expect(
      listingMatchesPrice({ salesType: "wolse" }, { maxRent: 80 }, false),
    ).toBe(true);
    expect(
      listingMatchesPrice({ salesType: "wolse" }, { maxRent: 80 }, true),
    ).toBe(false);
  });

  it("filters deposit and monthly rent in 만원", () => {
    const listing = { salesType: "wolse" as const, deposit: 1000, rent: 70 };
    expect(listingMatchesPrice(listing, { maxDeposit: 2000, maxRent: 80 }, true)).toBe(
      true,
    );
    expect(listingMatchesPrice(listing, { maxRent: 60 }, true)).toBe(false);
    expect(listingMatchesPrice(listing, { minDeposit: 1500 }, true)).toBe(false);
    expect(
      listingMatchesPrice(
        { salesType: "sale", price: 185000 },
        { maxDeposit: 200000 },
        true,
      ),
    ).toBe(true);
  });

  it("describes bounds in KRW", () => {
    expect(describePriceFilter({ maxDeposit: 2000, maxRent: 80 })).toBe(
      "Deposit ≤ ₩20 million · Monthly ≤ ₩800,000",
    );
  });
});
