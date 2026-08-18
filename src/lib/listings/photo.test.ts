import { describe, expect, it } from "vitest";
import { listingPhotoUrl, uniquePhotoUrls } from "./photo";

describe("listing photos", () => {
  it("adds the required Zigbang width query and proxies the image", () => {
    const src = listingPhotoUrl("https://ic.zigbang.com/ic/items/1/1.jpg");
    expect(src).toContain("/api/media?u=");
    expect(decodeURIComponent(src ?? "")).toContain("w=800");
  });

  it("upgrades protocol-relative Zigbang URLs", () => {
    const src = listingPhotoUrl("//ic.zigbang.com/ic/items/2/1.jpg", 400);
    expect(decodeURIComponent(src ?? "")).toContain("https://ic.zigbang.com/ic/items/2/1.jpg?w=400");
  });

  it("dedupes and proxies a gallery list for preload", () => {
    const urls = uniquePhotoUrls([
      "https://ic.zigbang.com/ic/items/1/1.jpg",
      "https://ic.zigbang.com/ic/items/1/1.jpg",
      "https://ic.zigbang.com/ic/items/1/2.jpg",
    ]);
    expect(urls).toHaveLength(2);
    expect(urls.every((src) => src.startsWith("/api/media?u="))).toBe(true);
  });
});
