import { describe, expect, it } from "vitest";
import { clusterBubbleLabel, clusterShowsUncertainty } from "./cluster-label";

describe("cluster bubble labels", () => {
  it("shows exact counts when verified", () => {
    expect(clusterBubbleLabel({ count: 5 })).toBe("5");
    expect(clusterShowsUncertainty({ count: 5 })).toBe(false);
  });

  it("shows an upper bound when uncertain", () => {
    expect(
      clusterBubbleLabel({
        count: 0,
        countUncertain: true,
        countMax: 12,
      }),
    ).toBe("≤12");
    expect(clusterShowsUncertainty({ count: 0, countUncertain: true })).toBe(true);
  });

  it("shows a verified partial count", () => {
    expect(
      clusterBubbleLabel({
        count: 3,
        countUncertain: true,
        countMax: 10,
      }),
    ).toBe("3");
  });
});