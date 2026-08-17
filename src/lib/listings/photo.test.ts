import { describe, expect, it } from "vitest";
import { listingPhotoUrl } from "./photo";

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
});
