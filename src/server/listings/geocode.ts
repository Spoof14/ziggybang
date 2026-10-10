import { type Place } from "~/lib/geo/places";
import {
  looksLikePlaceQuery,
  looksLikeStreetAddress,
  matchPlace,
  romanizeHangul,
} from "~/lib/listings/search";
import { cached } from "./cache";
import { fetchJson } from "./http";

export type NominatimHit = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
  place_rank?: number;
  boundingbox?: [string, string, string, string];
};

const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;

const SKIP_CATEGORIES = new Set([
  "building",
  "amenity",
  "shop",
  "office",
  "tourism",
  "highway",
  "leisure",
  "craft",
  "natural",
  "man_made",
  "aeroway",
  "landuse",
  "waterway",
]);

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

function categoryOf(hit: NominatimHit): string {
  return hit.category ?? hit.class ?? "";
}

function isPoiHit(hit: NominatimHit): boolean {
  return SKIP_CATEGORIES.has(categoryOf(hit));
}

export function geocodeQueryCandidates(query: string): string[] {
  const hangul = /[\uac00-\ud7a3]/.test(query);
  if (!hangul) return [`${query} Seoul`, `${query} Korea`];
  const candidates: string[] = [];
  if (!/[구동역시도]$/.test(query)) candidates.push(`${query}구`);
  candidates.push(`${query} 서울`, query);
  return [...new Set(candidates)];
}

export function scoreNominatimHit(
  hit: NominatimHit,
  query: string,
  options: { allowRoads?: boolean } = {},
): number {
  const road = options.allowRoads && categoryOf(hit) === "highway";
  if (isPoiHit(hit) && !road) return -1;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) return -1;

  const category = categoryOf(hit);
  const type = hit.type ?? "";
  const addressType = hit.addresstype ?? "";
  const name = hit.name ?? "";
  const display = hit.display_name ?? "";
  let score = (hit.importance ?? 0) * 1_000;

  if (category === "boundary" || type === "administrative") score += 5_000;
  if (addressType === "borough" || addressType === "city_district" || addressType === "suburb") {
    score += 2_000;
  }
  if (category === "place") score += 3_500;
  if (category === "railway" || type === "station" || addressType === "railway") score += 3_000;
  if (/서울|seoul/i.test(display)) score += 2_000;
  if (name === query || name === `${query}구` || name === `${query}동` || name === `${query}역`) {
    score += 1_500;
  }
  if (typeof hit.place_rank === "number") {
    score += Math.max(0, 30 - hit.place_rank) * 40;
  }
  if (road) {
    // Roads share names across districts: prefer the one inside the 구 / 동
    // the user typed.
    score += 4_000;
    const district = query.match(/[가-힣]+(?:구|동)/g) ?? [];
    if (district.some((name) => display.includes(name))) score += 6_000;
  }
  return score;
}

export function pickNominatimHit(
  hits: NominatimHit[],
  query: string,
  options: { allowRoads?: boolean } = {},
): NominatimHit | undefined {
  let best: { hit: NominatimHit; score: number } | undefined;
  for (const hit of hits) {
    const score = scoreNominatimHit(hit, query, options);
    if (score < 0) continue;
    if (!best || score > best.score) best = { hit, score };
  }
  return best?.hit;
}

async function searchNominatim(
  q: string,
  trimmed: string,
  allowRoads: boolean,
): Promise<Place | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "8",
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
  const hit = pickNominatimHit(hits, trimmed, { allowRoads });
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const hangul = hit.name ?? trimmed;
  const station = /station|subway|역/i.test(trimmed);
  const street = allowRoads && categoryOf(hit) === "highway";
  return {
    id: `geo:${lat.toFixed(4)},${lng.toFixed(4)}`,
    names: [...new Set([trimmed, hangul, romanizeHangul(hangul)].filter(Boolean))],
    lat,
    lng,
    zoom: street ? 17 : station ? 16 : zoomFromBox(hit.boundingbox),
    radiusM: street ? 400 : station ? 800 : undefined,
  };
}

export async function geocodeKorea(query: string): Promise<Place | null> {
  const trimmed = query.trim();
  if (!trimmed || !looksLikePlaceQuery(trimmed)) return null;
  const catalog = matchPlace(trimmed);
  const address = looksLikeStreetAddress(trimmed);
  if (catalog && !address) return catalog;

  return cached(`geo:v3:${trimmed.toLowerCase()}`, GEOCODE_TTL_MS, async () => {
    if (address) {
      // A full street address must not collapse to the district the catalog
      // matched on ("마포"). OpenStreetMap knows the road even when it lacks
      // the house number, which is close enough for a 400 m circle.
      for (const q of [...new Set([trimmed, `${trimmed} 서울`])]) {
        try {
          const found = await searchNominatim(q, trimmed, true);
          if (found) return found;
        } catch {
          /* try the next candidate, then the district */
        }
      }
      return catalog ? { ...catalog, districtOnly: true } : null;
    }
    for (const q of geocodeQueryCandidates(trimmed)) {
      const found = await searchNominatim(q, trimmed, false);
      if (found) return found;
    }
    return null;
  });
}
