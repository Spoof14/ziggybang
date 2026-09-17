import { describe, expect, it } from "vitest";
import { exclusiveAreaM2 } from "./area";

describe("exclusiveAreaM2", () => {
  it("prefers 전용면적 over 계약/공급 even when those keys come first", () => {
    expect(
      exclusiveAreaM2({
        계약면적M2: 42.95,
        공급면적M2: 36.1,
        전용면적M2: 29.53,
      }),
    ).toBe(29.53);
  });

  it("ignores shared-area fallbacks and pyeong duplicates", () => {
    expect(exclusiveAreaM2({ supplied_size: 40.54, real_size: 21.44 })).toBe(
      21.44,
    );
    expect(
      exclusiveAreaM2({
        exclusiveSpace: 84,
        supplySpace: 110,
        전용면적평: 25.4,
      }),
    ).toBe(84);
    expect(exclusiveAreaM2({ supplied_size: 40.54 })).toBeUndefined();
    expect(exclusiveAreaM2({ area1: 33 }, 19.8)).toBe(19.8);
  });
});
