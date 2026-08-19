import { describe, expect, it } from "vitest";
import { monthlyCostManwon, rankListings, valuePerM2 } from "./recommend";
import { type MapListing } from "./types";

function home(partial: Partial<MapListing> & Pick<MapListing, "id" | "lat" | "lng">): MapListing {
  return {
    source: "zigbang",
    sourceId: partial.id,
    propertyType: "oneroom",
    salesType: "wolse",
    url: "https://example.com",
    ...partial,
  };
}

describe("recommended homes", () => {
  it("treats monthly cost as rent plus a 5% deposit carry", () => {
    expect(
      monthlyCostManwon(
        home({
          id: "a",
          lat: 37.56,
          lng: 126.92,
          deposit: 1000,
          rent: 70,
        }),
      ),
    ).toBeCloseTo(70 + 1000 * (0.05 / 12), 5);
  });

  it("ranks a cheaper Yeonnam studio above a pricier Guro basement", () => {
    const ranked = rankListings([
      home({
        id: "guro",
        lat: 37.495,
        lng: 126.888,
        address: "서울 구로구 구로동",
        deposit: 2000,
        rent: 90,
        areaM2: 16,
        floor: "반지하/3",
        thumbnail: "https://example.com/g.jpg",
      }),
      home({
        id: "yeonnam",
        lat: 37.566,
        lng: 126.922,
        address: "서울 마포구 연남동",
        deposit: 1000,
        rent: 70,
        areaM2: 25,
        floor: "3/5",
        thumbnail: "https://example.com/y.jpg",
        photos: ["a", "b", "c", "d"],
      }),
    ]);
    expect(ranked[0]?.listing.id).toBe("yeonnam");
    expect(ranked[0]?.reasons.join(" ")).toMatch(/Yeonnam|₩\/m²|Floor 3/i);
    expect(ranked[1]?.reasons.join(" ")).toMatch(/basement/i);
  });

  it("uses inspected photos so a bright interior beats a floorplan", () => {
    const a = home({
      id: "bright",
      lat: 37.556,
      lng: 126.923,
      address: "서울 마포구 서교동",
      deposit: 1000,
      rent: 75,
      areaM2: 23,
      floor: "4/6",
      thumbnail: "https://example.com/bright.jpg",
    });
    const b = home({
      id: "plan",
      lat: 37.556,
      lng: 126.923,
      address: "서울 마포구 서교동",
      deposit: 1000,
      rent: 75,
      areaM2: 23,
      floor: "4/6",
      thumbnail: "https://example.com/plan.jpg",
    });
    const ranked = rankListings([a, b], {
      "https://example.com/bright.jpg": {
        score: 88,
        summary: "Bright, clear interior",
      },
      "https://example.com/plan.jpg": {
        score: 28,
        summary: "Mostly a floorplan",
        likelyFloorplan: true,
      },
    });
    expect(ranked[0]?.listing.id).toBe("bright");
    expect(ranked[0]?.reasons.join(" ")).toMatch(/bright/i);
    expect(ranked[1]?.reasons.join(" ")).toMatch(/floorplan/i);
  });

  it("calls out homes that welcome foreigners", () => {
    const ranked = rankListings([
      home({
        id: "ok",
        lat: 37.556,
        lng: 126.923,
        address: "서울 마포구 서교동",
        deposit: 1000,
        rent: 70,
        areaM2: 20,
        foreignerOk: true,
      }),
    ]);
    expect(ranked[0]?.reasons).toContain("Foreigners welcome");
  });

  it("scores lower ₩/m² as better value", () => {
    const cheap = valuePerM2(
      home({ id: "c", lat: 37.56, lng: 126.92, deposit: 500, rent: 50, areaM2: 30 }),
    );
    const spendy = valuePerM2(
      home({ id: "s", lat: 37.56, lng: 126.92, deposit: 2000, rent: 90, areaM2: 16 }),
    );
    expect(cheap).not.toBeNull();
    expect(spendy).not.toBeNull();
    expect(cheap!).toBeLessThan(spendy!);
  });
});
