import { describe, expect, it } from "vitest";
import {
  articleToListing,
  clusterToListing,
  extractClusters,
  extractNaverPhotos,
  isNaverFloorplan,
  mapNaverArticleDetail,
  mapNaverPropertyType,
  mapNaverSalesType,
  NAVER_ARTICLE_PAGES,
  articlePagesForCortarCount,
  clipNaverListingsToViewport,
  listingInventoryCount,
  naverArticleListParams,
  naverAreaRange,
  naverBudgetMs,
  naverClusterZoom,
  naverCortarLevel,
  naverFilterParams,
  naverListingUrl,
  naverRequestTimeoutMs,
  naverTransport,
  naverZoom,
  parseNaverManwon,
  pickRegionsInView,
} from "./naver";

describe("naver mappers", () => {
  it("maps an article list row into a unified listing", () => {
    const listing = articleToListing({
      atclNo: "2412345678",
      atclNm: "역삼동 오피스텔",
      rletTpCd: "OPST",
      tradTpCd: "B2",
      lat: 37.5,
      lng: 127.03,
      prc: 1000,
      rentPrc: 70,
      hanPrc: 1000,
      spc2: 29.5,
      flrInfo: "8/15",
    });

    expect(listing).toMatchObject({
      id: "naver:officetel:2412345678",
      source: "naver",
      propertyType: "officetel",
      salesType: "wolse",
      deposit: 1000,
      rent: 70,
      areaM2: 29.5,
      url: "https://m.land.naver.com/article/info/2412345678",
    });
  });

  it("parses 억-style deposits and sale prices", () => {
    const listing = articleToListing({
      atclNo: 1,
      rletTpNm: "아파트",
      tradTpNm: "매매",
      lat: 37.5,
      lng: 127.0,
      prc: 185000,
      hanPrc: "12억",
    });
    expect(listing?.salesType).toBe("sale");
    expect(listing?.price).toBe(185000);
    expect(listing?.deposit).toBe(120000);
  });

  it("drops articles without coordinates", () => {
    expect(articleToListing({ atclNo: "1" })).toBeNull();
  });

  it("maps new.land article fields, including 억 deposits", () => {
    expect(parseNaverManwon("1억 2,000")).toBe(12000);
    expect(parseNaverManwon("1,000")).toBe(1000);
    const listing = articleToListing({
      articleNo: "2645881772",
      articleName: "일반원룸",
      realEstateTypeCode: "OR",
      tradeTypeCode: "B2",
      latitude: "37.556",
      longitude: "126.923",
      dealOrWarrantPrc: "1,000",
      rentPrc: "70",
      area2: 19.8,
      floorInfo: "3/5",
      articleConfirmYmd: "20260831",
    });
    expect(listing).toMatchObject({
      id: "naver:oneroom:2645881772",
      source: "naver",
      salesType: "wolse",
      lat: 37.556,
      lng: 126.923,
      deposit: 1000,
      rent: 70,
      areaM2: 19.8,
      floor: "3/5",
    });
  });

  it("maps new.land cluster markers from an array payload", () => {
    const clusters = extractClusters([
      { latitude: 37.55, longitude: 126.91, count: 4, markerId: "abc" },
    ]);
    expect(clusterToListing(clusters[0]!, 0)).toMatchObject({
      id: "naver:cluster:abc",
      lat: 37.55,
      lng: 126.91,
      count: 4,
    });
  });

  it("clamps Naver zoom and maps codes", () => {
    expect(naverZoom(3)).toBe(8);
    expect(naverZoom(21)).toBe(19);
    expect(naverCortarLevel(11)).toBe("sido");
    expect(naverCortarLevel(13)).toBe("gu");
    expect(naverCortarLevel(16)).toBe("dong");
    expect(naverClusterZoom(12)).toBe(15);
    expect(naverClusterZoom(17)).toBe(17);
    expect(articlePagesForCortarCount(1)).toBe(NAVER_ARTICLE_PAGES);
    expect(articlePagesForCortarCount(3)).toBe(NAVER_ARTICLE_PAGES);
    expect(mapNaverSalesType("B1")).toBe("jeonse");
    expect(mapNaverPropertyType("VL")).toBe("villa");
    expect(naverListingUrl("9")).toContain("/article/info/9");
  });

  it("picks every dong in the map view, not only the nearest centre", () => {
    const hongdae = {
      south: 37.548,
      west: 126.91,
      north: 37.562,
      east: 126.93,
    };
    const dongs = [
      { cortarNo: "seogyo", centerLat: 37.555, centerLon: 126.922 },
      { cortarNo: "yeonnam", centerLat: 37.56, centerLon: 126.925 },
      { cortarNo: "hapjeong", centerLat: 37.549, centerLon: 126.914 },
      { cortarNo: "gangnam", centerLat: 37.498, centerLon: 127.028 },
    ];
    const picked = pickRegionsInView(dongs, hongdae, 3);
    expect(picked).toEqual(expect.arrayContaining(["seogyo", "yeonnam", "hapjeong"]));
    expect(picked).not.toContain("gangnam");
    expect(picked[0]).toBe("seogyo");
  });

  it("keeps map pins inside the viewport instead of the whole dong", () => {
    const hongdae = {
      south: 37.548,
      west: 126.91,
      north: 37.562,
      east: 126.93,
    };
    const pin = (id: string, lat: number, lng: number) =>
      articleToListing({
        articleNo: id,
        realEstateTypeCode: "OR",
        tradeTypeCode: "B2",
        latitude: lat,
        longitude: lng,
      });
    const inside = pin("in", 37.555, 126.922)!;
    const beside = pin("edge", 37.5485, 126.909)!;
    const far = pin("far", 37.498, 127.028)!;

    expect(clipNaverListingsToViewport([inside, beside, far], hongdae).map((item) => item.sourceId)).toEqual([
      "in",
    ]);
    expect(clipNaverListingsToViewport([beside, far], hongdae).map((item) => item.sourceId)).toEqual([
      "edge",
    ]);
    expect(clipNaverListingsToViewport([far], hongdae).map((item) => item.sourceId)).toEqual(["far"]);
  });

  it("sends budget, size, and building-age filters to Naver", () => {
    expect(naverAreaRange(["s"])).toEqual({ min: 20, max: 33 });
    expect(naverAreaRange(["s", "m"])).toEqual({ min: 20, max: 50 });
    expect(naverAreaRange(["xs", "s", "m", "l"])).toBeNull();
    const params = naverFilterParams({
      maxDeposit: 2000,
      maxRent: 70,
      areaBucketIds: ["s"],
      maxBuildingAge: 10,
    });
    expect(params.priceMax).toBe("2000");
    expect(params.rentPriceMax).toBe("70");
    expect(params.areaMin).toBe("20");
    expect(params.areaMax).toBe("33");
    expect(params.recentlyBuildYears).toBe("10");
    expect(listingInventoryCount([{ count: 12 }, { count: 1 }, {}])).toBe(14);
    const articleQuery = naverArticleListParams({
      cortarNo: "1168010800",
      page: 1,
      propertyTypes: ["oneroom", "officetel"],
      salesTypes: ["jeonse", "wolse"],
      maxDeposit: 2000,
    });
    expect(articleQuery.leftLon).toBeUndefined();
    expect(articleQuery.zoom).toBeUndefined();
    expect(articleQuery.priceMax).toBe("2000");
    expect(articleQuery.priceMin).toBeUndefined();
    expect(naverFilterParams({}).priceMax).toBeUndefined();
    expect(naverFilterParams({}, { defaults: true }).priceMax).toBe("900000000");
  });

  it("gives proxied and unlocked Naver requests more time than direct ones", () => {
    expect(naverRequestTimeoutMs("direct")).toBe(2500);
    expect(naverRequestTimeoutMs("proxy")).toBeGreaterThan(naverRequestTimeoutMs("direct"));
    expect(naverRequestTimeoutMs("unlocker")).toBeGreaterThan(naverRequestTimeoutMs("proxy"));
    expect(naverBudgetMs("direct")).toBe(2500);
    expect(naverBudgetMs("proxy")).toBeGreaterThan(naverBudgetMs("direct"));
    expect(naverBudgetMs("unlocker")).toBeGreaterThanOrEqual(naverRequestTimeoutMs("unlocker"));
    // First article page, then extra pages in parallel, must fit the proxied budget.
    expect(naverRequestTimeoutMs("proxy") * 2).toBeLessThanOrEqual(naverBudgetMs("proxy"));
    // Without proxy or unlocker configured, nothing changes.
    expect(naverTransport()).toBe("direct");
  });

  it("puts Naver floor plans (imageType 10) first in the gallery", () => {
    expect(isNaverFloorplan(10)).toBe(true);
    expect(isNaverFloorplan("20")).toBe(false);
    const urls = extractNaverPhotos({
      repImgUrl: "/thumb.jpg",
      articlePhotos: [
        { imageSrc: "/room.jpg", imageType: "20", imageOrder: 1 },
        { imageSrc: "/plan.jpg", imageType: "10", imageOrder: 2 },
        { imageSrc: "/kitchen.jpg", imageType: "20", imageOrder: 3 },
      ],
    });
    expect(urls[0]).toContain("/plan.jpg");
    expect(urls).toEqual([
      "https://landthumb-phinf.pstatic.net/plan.jpg",
      "https://landthumb-phinf.pstatic.net/room.jpg",
      "https://landthumb-phinf.pstatic.net/kitchen.jpg",
      "https://landthumb-phinf.pstatic.net/thumb.jpg",
    ]);
  });

  it("maps article-list photos onto the listing", () => {
    const listing = articleToListing({
      articleNo: "9",
      realEstateTypeCode: "OR",
      tradeTypeCode: "B2",
      latitude: 37.55,
      longitude: 126.91,
      repImgUrl: "/only.jpg",
      articlePhotos: [
        { imageSrc: "/plan.jpg", imageType: 10, imageOrder: 1 },
        { imageSrc: "/room.jpg", imageType: 20, imageOrder: 2 },
      ],
    });
    expect(listing?.photos?.[0]).toContain("/plan.jpg");
    expect(listing?.photos).toHaveLength(3);
    expect(listing?.thumbnail).toContain("/plan.jpg");
  });

  it("maps a new.land article detail payload including floor plans", () => {
    const listing = mapNaverArticleDetail(
      {
        articleNo: "2645147927",
        articleName: "대치푸르지오써밋",
        latitudeNum: 37.5,
        longitudeNum: 127.06,
        realEstateTypeCode: "APT",
        tradeTypeCode: "B1",
        articlePhotos: [
          { imageSrc: "/room.jpg", imageType: "20", imageOrder: 1 },
          { imageSrc: "/plan.jpg", imageType: "10", imageOrder: 2 },
        ],
        articleDetail: {
          articleNo: "2645147927",
          detailDescription: "남향 C타입",
          roomCount: "3",
          bathroomCount: "2",
          exposureAddress: "서울시 강남구 대치동",
        },
        articleSpace: { exclusiveSpace: 84, supplySpace: 110 },
        articleFloor: { correspondingFloorCount: "3", totalFloorCount: "17" },
        articlePrice: { warrantPrice: 120000, rentPrice: 0, dealPrice: 0 },
      },
      "2645147927",
    );
    expect(listing).toMatchObject({
      source: "naver",
      sourceId: "2645147927",
      salesType: "jeonse",
      areaM2: 84,
      floor: "3/17",
      bathrooms: 2,
    });
    expect(listing?.photos?.[0]).toContain("/plan.jpg");
    expect(listing?.photos?.length).toBe(2);
  });

  it("reads nested article-detail coordinates when the top-level pin is missing", () => {
    const listing = mapNaverArticleDetail(
      {
        articleNo: "1",
        articleName: "연남 원룸",
        realEstateTypeCode: "OR",
        tradeTypeCode: "B2",
        articleDetail: {
          articleNo: "1",
          latitude: "37.56",
          longitude: "126.92",
          exposureAddress: "서울시 마포구 연남동",
        },
      },
      "1",
    );
    expect(listing).toMatchObject({ lat: 37.56, lng: 126.92 });
  });
});
