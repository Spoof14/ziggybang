import { describe, expect, it } from "vitest";
import { formatArea, formatFloor, formatKrwFromManwon, formatRoomType, propertyTypeText, salesTypeText } from "./copy";
import { glossText, glossaryTerms } from "./glossary";

describe("Korean/English copy helpers", () => {
  it("formats money in Korean conventions", () => {
    expect(formatKrwFromManwon(12000, "ko")).toBe("1억 2,000만원");
    expect(formatKrwFromManwon(500, "ko")).toBe("500만원");
    expect(formatKrwFromManwon(12000, "en")).toMatch(/million|billion/i);
  });
  it("labels property and sales types", () => {
    expect(propertyTypeText("ko", "villa")).toBe("빌라");
    expect(propertyTypeText("en", "villa")).toBe("Villa");
    expect(salesTypeText("ko", "wolse")).toBe("월세");
    expect(salesTypeText("ko", "jeonse")).toBe("전세");
  });
  it("normalizes floors for English and keeps Korean for Korean", () => {
    expect(formatFloor("반지하", "en")).toMatch(/semi-basement/i);
    expect(formatFloor("옥탑", "en")).toMatch(/roof/i);
    expect(formatFloor("반지하", "ko")).toBe("반지하");
    expect(formatFloor("옥탑", "ko")).toBe("옥탑");
  });
  it("normalizes room types", () => {
    expect(formatRoomType("원룸(오픈형)", "ko")).toContain("원룸");
    expect(formatRoomType("원룸(오픈형)", "en")).not.toMatch(/[가-힣]/);
  });
  it("formats area with m² and pyeong", () => {
    expect(formatArea(33, "en")).toContain("m²");
    expect(formatArea(33, "ko")).toMatch(/㎡|m²/);
    expect(formatArea(33, "ko")).toContain("평");
  });
});

describe("glossary", () => {
  it("replaces common phrases for English only", () => {
    const text = "풀옵션 주차 가능 엘리베이터 반려동물 협의";
    const en = glossText(text, "en");
    expect(en).toMatch(/full/i);
    expect(en).toMatch(/parking/i);
    expect(en).toMatch(/elevator/i);
    expect(en).toMatch(/pet/i);
    expect(glossText(text, "ko")).toBe(text);
  });
  it("never mixes languages in a free-text subtitle", () => {
    const sentence = "서교동 2-room , 넓고 natural light 도 좋아요";
    expect(glossText("서교동 투룸, 넓고 채광도 좋아요", "en")).toBe("서교동 투룸, 넓고 채광도 좋아요");
    expect(glossText(sentence, "en")).toBe(sentence);
    expect(glossText("풀옵션 분리형 복층", "en")).toBe("fully furnished separate kitchen loft");
    expect(glossText("몰세권", "en")).toBe("near a shopping mall");
  });
  it("knows common listing tags", () => {
    for (const tag of ["몰세권", "역세권", "숲세권", "초품아", "올수리", "신축", "풀옵션", "분리형", "복층", "주차가능", "엘리베이터", "반려동물가능", "보안시설"]) {
      expect(glossaryTerms(tag).length, tag).toBeGreaterThan(0);
    }
  });
  it("finds terms and is null-safe", () => {
    expect(glossaryTerms("옵션 풀옵션").length).toBeGreaterThan(0);
    expect(glossaryTerms(undefined)).toEqual([]);
    expect(glossText(null, "en")).toBe("");
  });
});
