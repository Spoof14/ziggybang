import { describe, expect, it } from "vitest";
import { estimateAgencyFee, leaseDealKrw } from "./agency-fee";

describe("Korea housing agency fee cap", () => {
  it("uses deposit + 100× rent unless that exceeds the deposit", () => {
    expect(leaseDealKrw(5000, 50)).toBe(100_000_000);
    expect(leaseDealKrw(1000, 55)).toBe(48_500_000);
  });

  it("caps a typical Hongdae monthly studio", () => {
    const fee = estimateAgencyFee({
      salesType: "wolse",
      propertyType: "oneroom",
      deposit: 1000,
      rent: 55,
    });
    expect(fee?.ratePct).toBe(0.5);
    expect(fee?.feeLabel).toBe("₩200,000");
    expect(fee?.vatLabel).toBe("₩220,000");
    expect(fee?.kind).toBe("housing-lease");
  });

  it("uses 0.3% on a ₩190 million jeonse", () => {
    const fee = estimateAgencyFee({
      salesType: "jeonse",
      propertyType: "villa",
      deposit: 19_000,
    });
    expect(fee?.ratePct).toBe(0.3);
    expect(fee?.feeLabel).toBe("₩570,000");
  });

  it("uses a 0.5% midpoint for officetels", () => {
    const fee = estimateAgencyFee({
      salesType: "wolse",
      propertyType: "officetel",
      deposit: 1000,
      rent: 55,
    });
    expect(fee?.kind).toBe("officetel");
    expect(fee?.ratePct).toBe(0.5);
    expect(fee?.feeLabel).toBe("₩242,500");
  });
});
