import { describe, expect, it } from "vitest";
import {
  cameFromApp,
  listingPagePath,
  mergeListingDetail,
  parseListingPath,
} from "./path";
import { type MapListing } from "./types";

const studio: MapListing = {
  id: "zigbang:oneroom:1",
  source: "zigbang",
  sourceId: "1",
  lat: 37.55,
  lng: 126.92,
  propertyType: "oneroom",
  url: "https://www.zigbang.com/home/oneroom/items/1",
};

describe("listing page path", () => {
  it("builds and parses a shareable listing URL", () => {
    const href = listingPagePath(studio);
    expect(href).toBe("/listing/zigbang/oneroom/1");
    expect(parseListingPath({ source: "zigbang", propertyType: "oneroom", sourceId: "1" })).toEqual({
      source: "zigbang",
      propertyType: "oneroom",
      sourceId: "1",
    });
    expect(
      parseListingPath({ source: "craigslist", propertyType: "oneroom", sourceId: "1" }),
    ).toBeNull();
  });

  it("uses history.back when the listing was opened from the app", () => {
    expect(cameFromApp({ idx: 2 }, "", "https://ziggybang.vercel.app")).toBe(true);
    expect(
      cameFromApp(
        { idx: 0 },
        "https://ziggybang.vercel.app/?q=hongdae",
        "https://ziggybang.vercel.app",
      ),
    ).toBe(true);
    expect(cameFromApp({ idx: 0 }, "https://www.zigbang.com/", "https://ziggybang.vercel.app")).toBe(
      false,
    );
    expect(cameFromApp({ idx: 0 }, "", "https://ziggybang.vercel.app")).toBe(false);
  });

  it("fills a stub detail with the map pin we already had", () => {
    const merged = mergeListingDetail(
      {
        ...studio,
        lat: 0,
        lng: 0,
        title: "Studio in Yeonnam",
      },
      { ...studio, deposit: 1000, rent: 70, salesType: "wolse" },
    );
    expect(merged).toMatchObject({
      title: "Studio in Yeonnam",
      lat: 37.55,
      lng: 126.92,
      deposit: 1000,
      rent: 70,
    });
  });
});
