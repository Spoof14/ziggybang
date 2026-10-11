import { describe, expect, it, vi } from "vitest";
import { shareListing } from "./share";
import { type MapListing } from "./types";

const listing: Pick<
  MapListing,
  "source" | "propertyType" | "sourceId" | "title"
> = {
  source: "zigbang",
  propertyType: "oneroom",
  sourceId: "42",
  title: "Yeonnam studio",
};

describe("shareListing", () => {
  it("uses the native share sheet when the browser has one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    await expect(
      shareListing(listing, { origin: "https://ziggybang.example" }),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Yeonnam studio",
      text: "Yeonnam studio",
      url: "https://ziggybang.example/listing/zigbang/oneroom/42",
    });
    vi.unstubAllGlobals();
  });

  it("copies the listing page URL when share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(
      shareListing(listing, { origin: "https://ziggybang.example" }),
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "https://ziggybang.example/listing/zigbang/oneroom/42",
    );
    vi.unstubAllGlobals();
  });

  it("does not copy when the user cancels the share sheet", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", {
      share: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("AbortError"), { name: "AbortError" }),
        ),
      clipboard: { writeText },
    });
    await expect(
      shareListing(listing, { origin: "https://ziggybang.example" }),
    ).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

import { listingPageUrl, listingMapHref } from "./path";
describe("language in shared links", () => {
  const l = { source: "zigbang", propertyType: "oneroom", sourceId: "1" } as const;
  it("carries ?lang=ko, omits it for English", () => {
    expect(listingPageUrl(l, "https://x.test", "ko")).toBe("https://x.test/listing/zigbang/oneroom/1?lang=ko");
    expect(listingPageUrl(l, "https://x.test")).toBe("https://x.test/listing/zigbang/oneroom/1");
    expect(listingMapHref({ lat: 37.5, lng: 127 }, "ko")).toContain("lang=ko");
  });
});
