import { describe, expect, it } from "vitest";
import {
  formatArea,
  formatFloor,
  formatKrwFromManwon,
  formatPrice,
  formatRoomType,
  friendlySourceError,
  propertyTypeLabel,
  salesTypeLabel,
} from "./copy";

describe("English listing copy", () => {
  it("formats 만원 amounts as KRW for foreigners", () => {
    expect(formatKrwFromManwon(19000)).toBe("₩190 million");
    expect(formatKrwFromManwon(70)).toBe("₩700,000");
    expect(formatKrwFromManwon(6.5)).toBe("₩65,000");
  });

  it("explains monthly rent as deposit plus rent", () => {
    expect(
      formatPrice({ salesType: "wolse", deposit: 1000, rent: 70 }),
    ).toBe("₩10 million deposit · ₩700,000 / month");
    expect(formatPrice({ salesType: "jeonse", deposit: 19000 })).toBe(
      "₩190 million",
    );
    expect(formatPrice({ salesType: "sale", price: 185000 })).toBe(
      "₩1.85 billion",
    );
  });

  it("shows square meters and pyeong", () => {
    expect(formatArea(16.42)).toBe("16.42 m² (5.0 pyeong)");
  });

  it("translates Korean floor and room labels", () => {
    expect(formatFloor("3/5")).toBe("Floor 3 of 5");
    expect(formatFloor("고/12")).toBe("Top floor of 12");
    expect(formatRoomType("분리형원룸")).toBe("Split studio");
  });

  it("uses English product labels", () => {
    expect(propertyTypeLabel.oneroom).toBe("Studio");
    expect(salesTypeLabel.jeonse).toBe("Jeonse");
    expect(friendlySourceError("naver", "fetch failed")).toContain("unavailable");
  });
});
