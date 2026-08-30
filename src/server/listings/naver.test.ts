import { describe, expect, it } from "vitest";
import {
  articleToListing,
  mapNaverPropertyType,
  mapNaverSalesType,
  naverBudgetMs,
  naverListingUrl,
  naverRequestTimeoutMs,
  naverTransport,
  naverZoom,
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
    // Two sequential article pages must fit inside the proxied aggregate budget.
    expect(naverRequestTimeoutMs("proxy") * 2).toBeLessThanOrEqual(naverBudgetMs("proxy"));
    // Without proxy or unlocker configured, nothing changes.
    expect(naverTransport()).toBe("direct");
  });
});
