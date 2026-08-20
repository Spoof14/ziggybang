import { describe, expect, it } from "vitest";
import { detectForeignerOk } from "./foreigner";

describe("foreigner-ok detection", () => {
  it("reads welcome and exclusive-room phrasing", () => {
    expect(detectForeignerOk("전입OK, 외국인환영,채광굿Newly built  flat")).toBe(
      true,
    );
    expect(
      detectForeignerOk("외국인전용호실 외국인거소신고 가능v 합정역더블역세권"),
    ).toBe(true);
    expect(
      detectForeignerOk("생활 에티켓 지켜주실 수 있는 외국인 대환영!!"),
    ).toBe(true);
    expect(detectForeignerOk("Foreigners welcome, newly built")).toBe(true);
  });

  it("treats an explicit refusal as not ok", () => {
    expect(detectForeignerOk("외국인 계약 불가합니다")).toBe(false);
    expect(detectForeignerOk("외국인환영 외국인계약불가")).toBe(false);
    expect(detectForeignerOk("채광 좋은 분리형 원룸입니다")).toBeUndefined();
  });
});
