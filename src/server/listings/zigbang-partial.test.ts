import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./http", () => ({
  fetchJson: vi.fn(),
  settledError: () => undefined,
  withTimeout: <T>(p: Promise<T>) => p,
}));
vi.mock("./cache", () => ({
  cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
}));

import { fetchJson } from "./http";
import { fetchZigbangListings } from "./zigbang";

const bounds = { south: 37.555, west: 126.92, north: 37.558, east: 126.925 };
const mocked = vi.mocked(fetchJson);

describe("fetchZigbangListings partial failures", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("keeps house markers when the apartment endpoint 404s", async () => {
    mocked.mockImplementation((url: string) => {
      if (url.includes("/v2/aparts/")) return Promise.reject(new Error("HTTP 404"));
      return Promise.resolve({ items: [{ id: 1, lat: 37.5565, lng: 126.9225 }] });
    });
    const listings = await fetchZigbangListings({
      bounds,
      zoom: 16,
      propertyTypes: ["oneroom", "apartment"],
      needsDetails: false,
    });
    expect(listings.map((item) => item.sourceId)).toContain("1");
  });

  it("still throws when every request fails", async () => {
    mocked.mockRejectedValue(new Error("HTTP 404"));
    await expect(
      fetchZigbangListings({
        bounds,
        zoom: 16,
        propertyTypes: ["apartment"],
        needsDetails: false,
      }),
    ).rejects.toThrow("HTTP 404");
  });
});
