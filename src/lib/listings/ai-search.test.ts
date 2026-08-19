import { describe, expect, it } from "vitest";
import { interpretSearch, mergeSearchIntent, type SearchSnapshot } from "./ai-search";

const current: SearchSnapshot = {
  searchInput: "",
  propertyTypes: ["oneroom", "villa", "officetel", "apartment"],
  salesTypes: ["jeonse", "wolse", "sale"],
  areaBucketIds: [],
  radiusM: 1200,
  viewMode: "map",
};

describe("conversational listing search", () => {
  it("turns a Hongdae budget into filters", () => {
    const result = interpretSearch(
      "I want a studio in Hongdae, monthly under ₩800,000, deposit under ₩20 million",
      current,
    );
    expect(result.snapshot.searchInput.toLowerCase()).toContain("hongdae");
    expect(result.snapshot.propertyTypes).toEqual(["oneroom"]);
    expect(result.snapshot.salesTypes).toEqual(["wolse"]);
    expect(result.snapshot.maxRent).toBe(80);
    expect(result.snapshot.maxDeposit).toBe(2000);
    expect(result.snapshot.viewMode).toBe("list");
    expect(result.reply.toLowerCase()).toContain("hongdae");
  });

  it("parses jeonse in 억 and station walk searches", () => {
    const gangnam = interpretSearch("jeonse apartment near Gangnam station, deposit max 3억", current);
    expect(gangnam.snapshot.salesTypes).toEqual(["jeonse"]);
    expect(gangnam.snapshot.propertyTypes).toEqual(["apartment"]);
    expect(gangnam.snapshot.maxDeposit).toBe(30_000);
    expect(gangnam.snapshot.searchInput.toLowerCase()).toContain("gangnam");

    const dangsan = interpretSearch(
      "officetel by Dangsan station, rent 50-70",
      current,
    );
    expect(dangsan.snapshot.propertyTypes).toEqual(["officetel"]);
    expect(dangsan.snapshot.minRent).toBe(50);
    expect(dangsan.snapshot.maxRent).toBe(70);
    expect(dangsan.snapshot.searchInput.toLowerCase()).toContain("dangsan");
  });

  it("keeps the place on follow-ups and can cheapen the budget", () => {
    const first = interpretSearch("studio near hongdae, rent under 80, deposit under 2000", current);
    const cheaper = interpretSearch("a bit cheaper", first.snapshot);
    expect(cheaper.snapshot.searchInput.toLowerCase()).toContain("hongdae");
    expect(cheaper.snapshot.maxRent).toBe(60);
    expect(cheaper.snapshot.maxDeposit).toBe(1600);
  });

  it("opens Best view for a recommended-homes request", () => {
    const result = interpretSearch("recommend the best value studios near Hongdae", current);
    expect(result.snapshot.viewMode).toBe("best");
    expect(result.snapshot.searchInput.toLowerCase()).toContain("hongdae");
    expect(result.snapshot.propertyTypes).toEqual(["oneroom"]);
  });

  it("turns a foreigners-welcome ask into that chip", () => {
    const result = interpretSearch("Foreigners welcome near Hongdae", current);
    expect(result.snapshot.foreignerOk).toBe(true);
    expect(result.snapshot.searchInput.toLowerCase()).toContain("hongdae");
    expect(result.reply.toLowerCase()).toContain("foreigners");
  });

  it("merges a rent-only patch onto existing filters", () => {
    const merged = mergeSearchIntent(
      { ...current, searchInput: "hongdae", maxDeposit: 2000, propertyTypes: ["oneroom"] },
      { maxRent: 60, salesTypes: ["wolse"] },
    );
    expect(merged.searchInput).toBe("hongdae");
    expect(merged.maxDeposit).toBe(2000);
    expect(merged.maxRent).toBe(60);
    expect(merged.propertyTypes).toEqual(["oneroom"]);
  });
});
