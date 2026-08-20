import { describe, expect, it } from "vitest";
import {
  mapZigbangItemDetail,
  mapZigbangPropertyType,
  mapZigbangSalesType,
  zigbangComplexToListing,
  zigbangListingUrl,
  zigbangMarkerToListing,
} from "./zigbang";

describe("zigbang mappers", () => {
  it("maps a house-property marker into a unified listing", () => {
    const listing = zigbangMarkerToListing(
      { id: 47814532, lat: 37.57, lng: 127.04 },
      "oneroom",
    );
    expect(listing).toMatchObject({
      id: "zigbang:oneroom:47814532",
      source: "zigbang",
      sourceId: "47814532",
      propertyType: "oneroom",
      thumbnail: "https://ic.zigbang.com/ic/items/47814532/1.jpg",
      url: "https://www.zigbang.com/home/oneroom/items/47814532",
    });
  });

  it("drops incomplete markers", () => {
    expect(zigbangMarkerToListing({ lat: 37.5 }, "villa")).toBeNull();
  });

  it("maps apartment complexes with a listing count", () => {
    const listing = zigbangComplexToListing({
      areaDanjiId: 946,
      lat: 37.49,
      lng: 127.06,
      itemIds: ["C1", "C2", "C3"],
    });
    expect(listing).toMatchObject({
      id: "zigbang:apartment:946",
      count: 3,
      url: "https://www.zigbang.com/home/apt/danjis/946",
    });
  });

  it("maps Korean sales and property labels", () => {
    expect(mapZigbangSalesType("전세")).toBe("jeonse");
    expect(mapZigbangSalesType("월세")).toBe("wolse");
    expect(mapZigbangSalesType("매매")).toBe("sale");
    expect(mapZigbangPropertyType("오피스텔")).toBe("officetel");
    expect(zigbangListingUrl("officetel", "1")).toContain("/officetel/items/1");
  });

  it("keeps parking, options, and the agent on a full item payload", () => {
    const listing = mapZigbangItemDetail(
      {
        item: {
          itemId: 42,
          title: "Sunny studio",
          description: "Near the station. 외국인환영",
          salesType: "월세",
          serviceType: "원룸",
          roomType: "오픈형원룸",
          imageThumbnail: "https://ic.zigbang.com/ic/items/42/1.jpg",
          images: ["https://ic.zigbang.com/ic/items/42/1.jpg"],
          updatedAt: "2026-07-29 10:40:48",
          approveDate: "20180510",
          moveinDate: "2026.06.30 이후 입주 가능 (협의가능)",
          elevator: false,
          bathroomCount: 1,
          parkingAvailableText: "주차 불가능",
          roomDirection: "SW",
          residenceType: "단독주택",
          options: ["에어컨", "냉장고"],
          price: { deposit: 1000, rent: 55 },
          location: { lat: 37.54, lng: 126.97 },
          area: { 전용면적M2: 15.2 },
          floor: { floor: "3", allFloors: "4" },
          manageCost: {
            amount: 5,
            includes: ["수도"],
            notIncludes: ["전기"],
          },
          addressOrigin: { fullText: "서울시 용산구 청파동3가" },
          neighborhoods: {
            amenities: [{ title: "더블역세권" }],
            nearbyPois: [
              {
                exists: true,
                poiType: "지하철역",
                distance: 322,
                transport: "foot",
                timeTaken: 290,
              },
            ],
          },
        },
        realtor: {
          name: "Kim",
          officeTitle: "Kim Realty",
          officePhone: "027132442",
          phone: "01037760955",
          officeAddress: "서울특별시 용산구",
        },
        subways: [{ name: "숙대입구역", description: "4호선" }],
      },
      "oneroom",
    );
    expect(listing).toMatchObject({
      id: "zigbang:oneroom:42",
      salesType: "wolse",
      parking: "주차 불가능",
      elevator: false,
      bathrooms: 1,
      options: ["에어컨", "냉장고"],
      manageIncludes: ["수도"],
      subways: [{ name: "숙대입구역", line: "4호선" }],
      nearby: [{ type: "지하철역", meters: 322, walkMinutes: 5 }],
      agent: { name: "Kim", office: "Kim Realty" },
      foreignerOk: true,
    });
  });
});
