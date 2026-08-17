import { type Bounds } from "~/lib/listings/types";

export type LatLng = { lat: number; lng: number };

export type CircleFilter = LatLng & { radiusM: number };

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceM(a: LatLng, b: LatLng): number {
  const earth = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(sin)));
}

export function pointInCircle(
  point: LatLng,
  circle: CircleFilter,
): boolean {
  return distanceM(point, circle) <= circle.radiusM;
}

export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng <
        ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function boundsAroundCircle(circle: CircleFilter): Bounds {
  const latDelta = circle.radiusM / 111_320;
  const lngDelta =
    circle.radiusM / (111_320 * Math.max(0.2, Math.cos(toRad(circle.lat))));
  return {
    south: circle.lat - latDelta,
    west: circle.lng - lngDelta,
    north: circle.lat + latDelta,
    east: circle.lng + lngDelta,
  };
}

export function boundsAroundPolygon(polygon: LatLng[]): Bounds | undefined {
  if (!polygon.length) return undefined;
  return {
    south: Math.min(...polygon.map((point) => point.lat)),
    west: Math.min(...polygon.map((point) => point.lng)),
    north: Math.max(...polygon.map((point) => point.lat)),
    east: Math.max(...polygon.map((point) => point.lng)),
  };
}

export function listingInArea(
  point: LatLng,
  circle?: CircleFilter,
  polygon?: LatLng[],
): boolean {
  if (circle) return pointInCircle(point, circle);
  if (polygon && polygon.length >= 3) return pointInPolygon(point, polygon);
  return true;
}

export function formatRadius(radiusM: number): string {
  if (radiusM >= 1000) {
    const km = Math.round((radiusM / 1000) * 10) / 10;
    return `${km.toLocaleString("en-US")} km`;
  }
  return `${Math.round(radiusM).toLocaleString("en-US")} m`;
}
