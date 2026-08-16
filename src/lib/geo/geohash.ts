import { type Bounds } from "~/lib/listings/types";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(
  lat: number,
  lng: number,
  precision: number,
): string {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch = (ch << 1) + 1;
        minLng = mid;
      } else {
        ch <<= 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = (ch << 1) + 1;
        minLat = mid;
      } else {
        ch <<= 1;
        maxLat = mid;
      }
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[ch] ?? "";
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

export function geohashBounds(hash: string): Bounds {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let even = true;

  for (const char of hash) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) {
      throw new Error(`Invalid geohash character: ${char}`);
    }
    for (let bit = 4; bit >= 0; bit -= 1) {
      const set = (idx >> bit) & 1;
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (set) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (set) minLat = mid;
        else maxLat = mid;
      }
      even = !even;
    }
  }

  return { south: minLat, west: minLng, north: maxLat, east: maxLng };
}

export function geohashCellSize(precision: number): {
  lat: number;
  lng: number;
} {
  let latBits = 0;
  let lngBits = 0;
  for (let i = 0; i < precision * 5; i += 1) {
    if (i % 2 === 0) lngBits += 1;
    else latBits += 1;
  }
  return {
    lat: 180 / 2 ** latBits,
    lng: 360 / 2 ** lngBits,
  };
}

export function geohashesInBounds(
  bounds: Bounds,
  precision: number,
  maxTiles = 16,
): string[] {
  const hashes = new Set<string>();
  const { lat: latStep, lng: lngStep } = geohashCellSize(precision);
  const startLat = bounds.south + latStep / 2;
  const startLng = bounds.west + lngStep / 2;

  for (let lat = startLat; lat <= bounds.north + latStep / 2; lat += latStep) {
    for (let lng = startLng; lng <= bounds.east + lngStep / 2; lng += lngStep) {
      hashes.add(
        encodeGeohash(
          Math.min(90, Math.max(-90, lat)),
          Math.min(180, Math.max(-180, lng)),
          precision,
        ),
      );
      if (hashes.size > maxTiles) {
        return geohashesInBounds(bounds, Math.max(1, precision - 1), maxTiles);
      }
    }
  }

  hashes.add(encodeGeohash(bounds.south, bounds.west, precision));
  hashes.add(encodeGeohash(bounds.north, bounds.east, precision));
  hashes.add(encodeGeohash(bounds.south, bounds.east, precision));
  hashes.add(encodeGeohash(bounds.north, bounds.west, precision));

  return [...hashes];
}

export function precisionForZoom(zoom: number): number {
  if (zoom >= 16) return 6;
  if (zoom >= 13) return 5;
  return 4;
}
