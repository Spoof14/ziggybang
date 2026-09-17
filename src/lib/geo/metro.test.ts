import { describe, expect, it } from "vitest";
import {
  metroLineWeight,
  metroLines,
  metroStations,
  stationTooltip,
  stationsInBounds,
} from "./metro";

describe("korea metro overlay", () => {
  it("includes colored Seoul lines and bilingual transfer stations", () => {
    const line2 = metroLines.find((line) => line.name === "Line 2");
    const arex = metroLines.find((line) => line.name === "AREX");
    const jungang = metroLines.find((line) => line.name === "Gyeongui–Jungang");
    expect(line2?.color).toBe("#00A84D");
    expect(arex?.color).toBe("#0090D2");
    expect(jungang?.color).toBe("#77C4A3");
    expect(line2?.paths.some((path) => path.length >= 8)).toBe(true);

    const hongik = metroStations.find(
      (station) => station.name === "Hongik University",
    );
    expect(hongik?.nameKo).toBe("홍대입구");
    expect(hongik?.lines).toEqual(["AREX", "Gyeongui–Jungang", "Line 2"]);
    expect(hongik?.lat).toBeGreaterThan(37.55);
    expect(hongik?.lng).toBeGreaterThan(126.92);
  });

  it("keeps overlay drawing cheap by clipping stations to the viewport", () => {
    const hongdae = stationsInBounds(
      metroStations,
      { south: 37.55, west: 126.91, north: 37.56, east: 126.93 },
      20,
    );
    expect(
      hongdae.some((station) => station.name === "Hongik University"),
    ).toBe(true);
    expect(hongdae.length).toBeLessThanOrEqual(20);
    expect(
      stationsInBounds(metroStations, { south: 1, west: 1, north: 2, east: 2 }),
    ).toEqual([]);
  });

  it("thickens lines as you zoom in and labels stations in English", () => {
    expect(metroLineWeight(11)).toBeLessThan(metroLineWeight(16));
    expect(
      stationTooltip({
        id: "1",
        name: "Hongik University",
        lat: 37.55,
        lng: 126.92,
        lines: ["Line 2", "AREX"],
      }),
    ).toBe("Hongik University · Line 2 · AREX");
  });
});
