import { type Bounds } from "~/lib/listings/types";

export function isValidBounds(bounds: Bounds): boolean {
  return (
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.west) &&
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.east) &&
    bounds.north > bounds.south &&
    bounds.east > bounds.west &&
    bounds.south >= -90 &&
    bounds.north <= 90 &&
    bounds.west >= -180 &&
    bounds.east <= 180
  );
}

/** Leaflet reports empty/world boxes when the map container is display:none or 0×0. */
export function isUsableMapViewport(
  size: { x: number; y: number },
  bounds: Bounds,
): boolean {
  return size.x >= 80 && size.y >= 80 && isValidBounds(bounds);
}

export function containsPoint(
  bounds: Bounds,
  lat: number,
  lng: number,
): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

export function boundsCenter(bounds: Bounds): { lat: number; lng: number } {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
}

export function boundsArea(bounds: Bounds): number {
  return (bounds.north - bounds.south) * (bounds.east - bounds.west);
}

export function overlapRatio(a: Bounds, b: Bounds): number {
  const south = Math.max(a.south, b.south);
  const west = Math.max(a.west, b.west);
  const north = Math.min(a.north, b.north);
  const east = Math.min(a.east, b.east);
  if (north <= south || east <= west) return 0;
  const intersection = (north - south) * (east - west);
  return intersection / Math.max(boundsArea(a), boundsArea(b));
}

export function expandBounds(bounds: Bounds, factor: number): Bounds {
  const latPad = ((bounds.north - bounds.south) * factor) / 2;
  const lngPad = ((bounds.east - bounds.west) * factor) / 2;
  return {
    south: Math.max(-90, bounds.south - latPad),
    west: Math.max(-180, bounds.west - lngPad),
    north: Math.min(90, bounds.north + latPad),
    east: Math.min(180, bounds.east + lngPad),
  };
}
