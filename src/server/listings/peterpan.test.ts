import { describe, expect, it } from "vitest";
import {
  collectHouses,
  houseToListing,
  mapPeterpanPropertyType,
  mapPeterpanSalesType,
  peterpanListingUrl,
} from "./peterpan";

describe("peterpan mappers", () => {
  it("maps a house card into KRW-manwon listing fields", () => {
    const listing = houseToListing({
      hidx: 19727810,
      info: {
        subject: "서초역 1.5룸",
        thumbnail: "https://img.peterpanz.com/photo/x.jpg",
        room_type: "원룸",
        real_size: 7.52,
      },
      type: { contract_type: "전세", building_type: "빌라/주택" },
      price: { monthly_fee: 0, deposit: 230_000_000, maintenance_cost: 140_000 },
      floor: { floor_text_detail: "2층/5층" },
      location: {
        coordinate: { latitude: "37.490119", longitude: "127.019508" },
        address: { text: "서초구 서초동" },
      },
    });

    expect(listing).toMatchObject({
      id: "peterpan:19727810",
      source: "peterpan",
      salesType: "jeonse",
      propertyType: "villa",
      deposit: 23000,
      areaM2: 7.52,
      url: peterpanListingUrl("19727810"),
    });
  });

  it("uses exclusive size and ignores supplied common area", () => {
    const exclusive = houseToListing({
      hidx: 1,
      info: { real_size: 21.44, supplied_size: 40.54 },
      type: { contract_type: "월세", building_type: "오피스텔" },
      location: { coordinate: { latitude: "37.5", longitude: "127.0" } },
    });
    const sharedOnly = houseToListing({
      hidx: 2,
      info: { supplied_size: 40.54 },
      type: { contract_type: "월세", building_type: "오피스텔" },
      location: { coordinate: { latitude: "37.5", longitude: "127.0" } },
    });
    expect(exclusive?.areaM2).toBe(21.44);
    expect(sharedOnly?.areaM2).toBeUndefined();
  });

  it("treats 단기임대 as monthly rent", () => {
    expect(mapPeterpanSalesType("단기임대")).toBe("wolse");
    expect(mapPeterpanPropertyType("원/투룸")).toBe("oneroom");
  });
});

describe("collectHouses", () => {
  const VIEW = { south: 37.532, north: 37.593, west: 126.78, east: 126.905 };
  // 684 homes spread over the repro viewport; upstream returns the southernmost
  // `pageSize` of whatever box is asked, like the live API did for Magok.
  const all = Array.from({ length: 684 }, (_, i) => ({
    id: `peterpan:${i}`,
    source: "peterpan" as const,
    sourceId: String(i),
    lat: VIEW.south + ((VIEW.north - VIEW.south) * ((i * 7) % 684)) / 683,
    lng: VIEW.west + ((VIEW.east - VIEW.west) * ((i * 13) % 684)) / 683,
    propertyType: "villa" as const,
    url: "",
  }));
  const fetchPage = async (box: typeof VIEW) => {
    const inside = all
      .filter((h) => h.lat >= box.south && h.lat <= box.north && h.lng >= box.west && h.lng <= box.east)
      .sort((a, b) => a.lat - b.lat);
    return { houses: inside.slice(0, 300), total: inside.length };
  };

  it("single page only reaches the south; collectHouses covers the viewport", async () => {
    const first = await fetchPage(VIEW);
    expect(Math.max(...first.houses.map((h) => h.lat))).toBeLessThan(37.57);
    const got = await collectHouses(VIEW, fetchPage);
    expect(got.length).toBeGreaterThan(300);
    expect(Math.max(...got.map((h) => h.lat))).toBeGreaterThan(37.59);
    expect(Math.min(...got.map((h) => h.lat))).toBeLessThan(37.535);
    expect(new Set(got.map((h) => h.id)).size).toBe(got.length);
  });

  it("does not split a box that fits one page", async () => {
    let calls = 0;
    const got = await collectHouses(VIEW, async () => {
      calls += 1;
      return { houses: all.slice(0, 40), total: 40 };
    });
    expect(calls).toBe(1);
    expect(got).toHaveLength(40);
  });
});
