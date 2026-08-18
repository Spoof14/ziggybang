import { type Place } from "~/lib/geo/places";
import { looksLikePlaceQuery, matchPlace, romanizeHangul } from "~/lib/listings/search";
import { cached } from "./cache";
import { fetchJson } from "./http";

type NominatimHit = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  boundingbox?: [string, string, string, string];
};

const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;

function inKorea(lat: number, lng: number) {
  return lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132;
}

function zoomFromBox(box?: NominatimHit["boundingbox"]): number {
  if (!box) return 15;
  const south = Number(box[0]);
  const north = Number(box[1]);
  const west = Number(box[2]);
  const east = Number(box[3]);
  if (![south, north, west, east].every(Number.isFinite)) return 15;
  const span = Math.max(north - south, east - west);
  if (span > 0.4) return 11;
  if (span > 0.12) return 13;
  if (span > 0.04) return 15;
  return 16;
}

export async function geocodeKorea(query: string): Promise<Place | null> {
  const trimmed = query.trim();
  if (!trimmed || !looksLikePlaceQuery(trimmed)) return null;
  const catalog = matchPlace(trimmed);
  if (catalog) return catalog;

  return cached(`geo:${trimmed.toLowerCase()}`, GEOCODE_TTL_MS, async () => {
    const candidates = /[\uac00-\ud7a3]/.test(trimmed)
      ? [trimmed, `${trimmed} 서울`]
      : [`${trimmed} Seoul`, `${trimmed} Korea`];
    for (const q of candidates) {
      const params = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        countrycodes: "kr",
        q,
      });
      const hits = await fetchJson<NominatimHit[]>(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          timeoutMs: 4000,
          headers: {
            "user-agent": "Ziggybang/1.0 (Korea rental map)",
            accept: "application/json",
          },
        },
      );
      const hit = hits[0];
      const lat = Number(hit?.lat);
      const lng = Number(hit?.lon);
      if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) {
        continue;
      }
      const hangul = hit.name ?? trimmed;
      const station = /station|subway|역/i.test(trimmed);
      return {
        id: `geo:${lat.toFixed(4)},${lng.toFixed(4)}`,
        names: [...new Set([trimmed, hangul, romanizeHangul(hangul)].filter(Boolean))],
        lat,
        lng,
        zoom: station ? 16 : zoomFromBox(hit.boundingbox),
        radiusM: station ? 800 : undefined,
      };
    }
    return null;
  });
}
