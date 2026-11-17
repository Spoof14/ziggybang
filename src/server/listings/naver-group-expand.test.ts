import { describe, expect, it, vi } from "vitest";
import { expandNaverGroupsFiltered, mergeListingDetail } from "./naver-group-expand";
import { type MapListing, type ListingDetail } from "~/lib/listings/types";

const pin = (id: string, extra: Partial<MapListing> = {}): MapListing => ({
  id: `naver:oneroom:${id}`,
  source: "naver",
  sourceId: id,
  lat: 37.55,
  lng: 126.92,
  propertyType: "oneroom",
  salesType: "wolse",
  title: `Room ${id}`,
  deposit: 5000,
  rent: 80,
  url: `https://m.land.naver.com/article/info/${id}`,
  ...extra,
});

describe("expandNaverGroupsFiltered", () => {
  it("returns filtered homes and clears a building with zero matches", async () => {
    const articles = [
      pin("1", { foreignerOk: false }),
      pin("2", { foreignerOk: false }),
    ];
    const result = await expandNaverGroupsFiltered({
      groups: [{ sourceId: "lgeo1", lat: 37.55, lng: 126.92, count: 2 }],
      bounds: { south: 37.54, west: 126.91, north: 37.56, east: 126.93 },
      zoom: 17,
      propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
      foreignerOk: true,
      fetchGroup: async () => articles,
    });
    expect(result.listings).toHaveLength(0);
    expect(result.emptySourceIds).toEqual(["lgeo1"]);
  });

  it("enriches list rows before detail-only filters so taps can show homes", async () => {
    const articles = [pin("42", { foreignerOk: undefined, title: "plain" })];
    const fetchDetail = vi.fn(async (): Promise<ListingDetail> => ({
      ...pin("42"),
      foreignerOk: true,
      description: "foreigner welcome",
    }));
    const result = await expandNaverGroupsFiltered({
      groups: [{ sourceId: "lgeo1", lat: 37.55, lng: 126.92, count: 1 }],
      bounds: { south: 37.54, west: 126.91, north: 37.56, east: 126.93 },
      zoom: 17,
      propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
      foreignerOk: true,
      fetchGroup: async () => articles,
      fetchDetail,
    });
    expect(fetchDetail).toHaveBeenCalledWith("42");
    expect(result.listings).toHaveLength(1);
    expect(result.emptySourceIds).toEqual([]);
  });

  it("does not mark a group empty when the article fetch fails", async () => {
    const result = await expandNaverGroupsFiltered({
      groups: [{ sourceId: "lgeo1", lat: 37.55, lng: 126.92, count: 3 }],
      bounds: { south: 37.54, west: 126.91, north: 37.56, east: 126.93 },
      zoom: 17,
      propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
      fetchGroup: async () => {
        throw new Error("naver down");
      },
    });
    expect(result.listings).toHaveLength(0);
    expect(result.emptySourceIds).toEqual([]);
  });
});

describe("mergeListingDetail", () => {
  it("fills floor and foreignerOk from detail", () => {
    const merged = mergeListingDetail(pin("1"), {
      ...pin("1"),
      floor: "3/5",
      foreignerOk: true,
    });
    expect(merged).toMatchObject({ floor: "3/5", foreignerOk: true });
  });
});