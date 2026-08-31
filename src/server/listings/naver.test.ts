import { describe, expect, it } from "vitest";
import {
  articleToListing,
  clusterToListing,
  extractClusters,
  mapNaverPropertyType,
  mapNaverSalesType,
  naverBudgetMs,
  naverListingUrl,
  naverRequestTimeoutMs,
  naverTransport,
  naverZoom,
  parseNaverManwon,
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
      latitude: 37.556,
      longitude: 126.923,
      dealOrWarrantPrc: "1,000",
      rentPrc: 70,
      area2: 19.8,
      floorInfo: "3/5",
      articleConfirmYmd: "20260831",
    });
    expect(listing).toMatchObject({
      id: "naver:oneroom:2645881772",
      source: "naver",
      salesType: "wolse",
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
    expect(mapNaverSalesType("B1")).toBe("jeonse");
    expect(mapNaverPropertyType("VL")).toBe("villa");
    expect(naverListingUrl("9")).toContain("/article/info/9");
  });

  it("gives proxied and unlocked Naver requests more time than direct ones", () => {
    expect(naverRequestTimeoutMs("direct")).toBe(2500);
    expect(naverRequestTimeoutMs("proxy")).toBeGreaterThan(naverRequestTimeoutMs("direct"));
    expect(naverRequestTimeoutMs("unlocker")).toBeGreaterThan(naverRequestTimeoutMs("proxy"));
    expect(naverBudgetMs("direct")).toBe(2500);
    expect(naverBudgetMs("proxy")).toBeGreaterThan(naverBudgetMs("direct"));
    expect(naverBudgetMs("unlocker")).toBeGreaterThanOrEqual(naverRequestTimeoutMs("unlocker"));
    // Session + region lookups + two article pages must fit in the proxied budget.
    expect(naverRequestTimeoutMs("proxy") * 2).toBeLessThanOrEqual(naverBudgetMs("proxy"));
    expect(naverRequestTimeoutMs("proxy") * 3).toBeLessThanOrEqual(naverBudgetMs("proxy"));
    // Without proxy or unlocker configured, nothing changes.
    expect(naverTransport()).toBe("direct");
  });
});
