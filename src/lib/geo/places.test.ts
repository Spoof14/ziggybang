import { describe, expect, it } from "vitest";
import { places } from "./places";
import { matchPlace } from "~/lib/listings/search";

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (a.lat - b.lat) * 111.2;
  const dLng = (a.lng - b.lng) * 111.2 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

const KNOWN: Record<string, { lat: number; lng: number }> = {
  gangnam: { lat: 37.4979, lng: 127.0276 },
  itaewon: { lat: 37.5345, lng: 126.9946 },
  "seoul-station": { lat: 37.5547, lng: 126.9707 },
  hongdae: { lat: 37.5563, lng: 126.9236 },
  sinchon: { lat: 37.5551, lng: 126.9367 },
  yeouido: { lat: 37.5219, lng: 126.9245 },
  dangsan: { lat: 37.5343, lng: 126.9023 },
  mangwon: { lat: 37.556, lng: 126.91 },
  mapo: { lat: 37.5663, lng: 126.9019 },
  hapjeong: { lat: 37.5496, lng: 126.9139 },
};

describe("place table", () => {
  it("has unique ids and plausible Korean coordinates", () => {
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
    for (const p of places) {
      expect(p.lat).toBeGreaterThan(33);
      expect(p.lat).toBeLessThan(38.7);
      expect(p.lng).toBeGreaterThan(124.5);
      expect(p.lng).toBeLessThan(130);
    }
  });
  it.each(Object.entries(KNOWN))("%s is within 400 m of the real location", (id, truth) => {
    const place = places.find((p) => p.id === id)!;
    expect(km(place, truth)).toBeLessThan(0.4);
  });
  it("resolves names to the matching entry", () => {
    expect(matchPlace("Mapo")?.id).toBe("mapo");
    expect(matchPlace("mangwon")?.id).toBe("mangwon");
    expect(matchPlace("Itaewon")?.id).toBe("itaewon");
  });
});
