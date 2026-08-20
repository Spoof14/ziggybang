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

  it("turns an ask message into deposit and rent filters", async () => {
    const caller = createCaller({ headers: new Headers() });
    const result = await caller.listings.ask({
      messages: [
        {
          role: "user",
          content: "studio in hongdae, rent under 80, deposit under 2000",
        },
      ],
      current: {
        searchInput: "",
        propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
        salesTypes: ["jeonse", "wolse", "sale"],
        areaBucketIds: [],
        radiusM: 1200,
        viewMode: "map",
      },
    });
    expect(result.provider).toBe("local");
    expect(result.snapshot.searchInput.toLowerCase()).toContain("hongdae");
    expect(result.snapshot.propertyTypes).toEqual(["oneroom"]);
    expect(result.snapshot.maxRent).toBe(80);
    expect(result.snapshot.maxDeposit).toBe(2000);
    expect(result.snapshot.viewMode).toBe("list");
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
