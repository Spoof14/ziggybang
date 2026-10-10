import { describe, expect, it } from "vitest";
import { distanceM, groupedHomesHint, sortByDistanceTo } from "./order";

describe("list ordering", () => {
  const hongdae = { lat: 37.5563, lng: 126.9236 };
  const dangsan = { id: "dangsan", lat: 37.5346, lng: 126.9025 };
  const mangwon = { id: "mangwon", lat: 37.5556, lng: 126.9101 };
  const seonyudo = { id: "seonyudo", lat: 37.5379, lng: 126.8935 };

  it("puts the homes nearest the map center first", () => {
    const sorted = sortByDistanceTo([seonyudo, dangsan, mangwon], hongdae);
    expect(sorted.map((item) => item.id)).toEqual(["mangwon", "dangsan", "seonyudo"]);
  });

  it("keeps API order without a center and does not mutate input", () => {
    const input = [seonyudo, dangsan];
    expect(sortByDistanceTo(input, undefined)).toEqual(input);
    sortByDistanceTo(input, hongdae);
    expect(input[0]).toBe(seonyudo);
  });

  it("measures meters", () => {
    expect(Math.round(distanceM({ lat: 37.5, lng: 127 }, { lat: 37.51, lng: 127 }))).toBeCloseTo(1112, -1);
  });

  it("explains an empty list that still has map clusters", () => {
    expect(groupedHomesHint(0)).toBeUndefined();
    expect(groupedHomesHint(48)).toMatch(/Zoom in to load individual homes/);
    expect(groupedHomesHint(48)).toContain("48");
  });
});
