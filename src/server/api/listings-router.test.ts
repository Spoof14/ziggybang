import { describe, expect, it } from "vitest";
import { createCaller } from "./root";

describe("listings router", () => {
  it("validates bounds through tRPC", async () => {
    const caller = createCaller({ headers: new Headers() });
    await expect(
      caller.listings.getMap({
        bounds: { south: 38, west: 126, north: 37, east: 127 },
        zoom: 13,
        sources: ["zigbang"],
        propertyTypes: ["oneroom"],
        salesTypes: ["jeonse"],
      }),
    ).rejects.toThrow(/Invalid map bounds/);
  });

  it("returns English landlord notes without calling OpenAI", async () => {
    const caller = createCaller({ headers: new Headers() });
    await expect(
      caller.listings.translateNotes({ text: "Newly built flat near Hongdae" }),
    ).resolves.toEqual({
      english: "Newly built flat near Hongdae",
      source: "original",
    });
  });
});
