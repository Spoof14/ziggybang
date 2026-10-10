import { describe, expect, it } from "vitest";
import {
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
