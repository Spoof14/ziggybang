import { describe, expect, it } from "vitest";
import {
  formatApproveYear,
  formatKoreanPhone,
  formatListedAt,
  formatMoveIn,
  telHref,
  translateAmenity,
  translateDirection,
  translateOption,
  translateParking,
  translateSubwayLine,
  translateUtility,
} from "./detail-copy";

describe("English listing extras", () => {
  it("translates furniture, utilities, and parking", () => {
    expect(translateOption("에어컨")).toBe("Air conditioner");
    expect(translateUtility("수도")).toBe("Water");
    expect(translateParking("주차 불가능")).toBe("No parking");
    expect(translateParking("주차 2대 가능")).toBe("Parking for 2 cars");
    expect(translateAmenity("더블역세권")).toBe("Two subway stations nearby");
    expect(translateDirection("SW")).toBe("Southwest");
    expect(translateSubwayLine("4호선,경의중앙선")).toBe(
      "Line 4, Gyeongui–Jungang",
    );
  });

  it("turns Korean listing dates and phones into English", () => {
    expect(formatApproveYear("20180510")).toBe("Built 2018");
    expect(formatListedAt("2026-07-29 10:40:48")).toBe("Listed 29 Jul 2026");
    expect(formatMoveIn("2026.06.30 이후 입주 가능 (협의가능)")).toBe(
      "Move-in from 30 Jun 2026 (negotiable)",
    );
    expect(formatKoreanPhone("027132442")).toBe("02-713-2442");
    expect(telHref("01037760955")).toBe("tel:+821037760955");
  });
});
