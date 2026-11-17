import { describe, expect, it } from "vitest";
import { refineNaverGroupedForDetailFilters, uncertainNaverGroup } from "./naver-group-refine";
import { type MapListing } from "~/lib/listings/types";

const bounds = { south: 37.5, west: 126.9, north: 37.6, east: 127.0 };

function groupRow(count: number, id = "naver:cluster:lgeo1"): MapListing {
  return {
    id,
    source: "naver",
    sourceId: "lgeo1",
    propertyType: "oneroom",
    lat: 37.55,
    lng: 126.95,
    count,
    url: "https://example.com",
  };
}

describe("refineNaverGroupedForDetailFilters", () => {
  it("drops groups with zero matches", async () => {
    const refined = await refineNaverGroupedForDetailFilters([groupRow(8)], {
      bounds,
      zoom: 16,
      propertyTypes: ["oneroom"],
      detailFilters: {
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
        foreignerOk: true,
      },
      deadlineMs: Date.now() + 5000,
      fetchGroup: async () => [
        {
          id: "naver:article:1",
          source: "naver",
          sourceId: "1",
          propertyType: "oneroom",
          lat: 37.55,
          lng: 126.95,
          title: "no foreigners",
          foreignerOk: false,
          url: "https://example.com/1",
        },
      ],
    });
    expect(refined).toEqual([]);
  });

  it("emits individual pins for small verified groups", async () => {
    const refined = await refineNaverGroupedForDetailFilters([groupRow(2)], {
      bounds,
      zoom: 16,
      propertyTypes: ["oneroom"],
      detailFilters: {
        salesTypes: ["jeonse", "wolse"],
        areaBucketIds: [],
        query: "",
        foreignerOk: true,
      },
      deadlineMs: Date.now() + 5000,
      fetchGroup: async () => [
        {
          id: "naver:article:1",
          source: "naver",
          sourceId: "1",
          propertyType: "oneroom",
          lat: 37.55,
          lng: 126.95,
          salesType: "jeonse",
          deposit: 1000,
          foreignerOk: true,
          url: "https://example.com/1",
        },
        {
          id: "naver:article:2",
          source: "naver",
          sourceId: "2",
          propertyType: "oneroom",
          lat: 37.551,
          lng: 126.951,
          salesType: "jeonse",
          deposit: 2000,
          foreignerOk: true,
          url: "https://example.com/2",
        },
      ],
    });
    expect(refined).toHaveLength(2);
    expect(refined[0]?.id).toMatch(/naver:article/);
  });

  it("marks uncertain rows when the budget is gone", async () => {
    const pending = uncertainNaverGroup(groupRow(12));
    expect(pending.countUncertain).toBe(true);
    expect(pending.countMax).toBe(12);
  });
});