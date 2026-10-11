import { describe, expect, it } from "vitest";
import { places, placeDisplayName, placeKo } from "~/lib/geo/places";
import { constraintChips, type AskConstraints } from "./ask-picks";
import { areaLabel } from "./ask-quality";
import { englishAddressLine, englishNeighborhood, koreanNeighborhood } from "./english";

const mangwon: AskConstraints = {
  place: { name: "mangwon", lat: 37.556, lng: 126.91, radiusM: 800, kind: "place" },
  commute: { name: "gangnam", lat: 37.4979, lng: 127.0276, maxMin: 30 },
  similarTo: { id: "x", label: "Hongdae" },
};

describe("Korean place names", () => {
  it("every catalog place has a Korean display name", () => {
    for (const p of places) expect(/[가-힣]/.test(placeKo(p)), p.id).toBe(true);
  });
  it("uses the same name in chips, labels and the English UI", () => {
    expect(placeDisplayName("mangwon", "ko")).toBe("망원");
    expect(placeDisplayName("mangwon", "en")).toBe("Mangwon");
    expect(placeDisplayName("Some Geocoded Cafe", "ko")).toBe("Some Geocoded Cafe");
    const ko = constraintChips(mangwon, "ko").map((c) => c.label).join(" | ");
    expect(ko).toContain("망원 근처 · 800 m");
    expect(ko).toContain("강남까지");
    expect(ko).toContain("홍대 매물");
    expect(ko).not.toMatch(/Mangwon|Gangnam|Hongdae/);
    const en = constraintChips(mangwon, "en").map((c) => c.label).join(" | ");
    expect(en).toContain("Near Mangwon · 800 m");
    expect(en).toContain("Similar to the Hongdae listing");
  });
  it("area labels use the Korean name in Korean", () => {
    const l = { lat: 37.5561, lng: 126.9101, address: "서울 마포구 망원동 1" };
    expect(areaLabel(l, "ko")).toBe("망원 근처");
    expect(areaLabel(l, "en")).toBe("Near Mangwon");
  });
});

describe("district labels never contradict the place", () => {
  it("drops a neighbourhood that sits in another 구", () => {
    const address = "서울특별시 강남구 성수 1";
    expect(englishNeighborhood(address)).not.toBe("Seongsu");
    expect(koreanNeighborhood(address)).not.toBe("성수");
    expect(englishAddressLine({ address } as never, "en")).not.toMatch(/Seongsu/);
    expect(englishAddressLine({ address } as never, "en")).toMatch(/Gangnam/);
    // A place-table hit whose district differs from the address is dropped, not paired.
    expect(englishAddressLine({ address: "Seongsu, Gangnam-gu" } as never, "en")).toBe("Gangnam-gu");
  });
  it("keeps a matching pair", () => {
    const address = "서울특별시 성동구 성수동 1";
    expect(englishAddressLine({ address } as never, "en")).toBe("Seongsu · Seongdong-gu");
  });
});
