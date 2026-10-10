export type LatLngLike = { lat: number; lng: number };

/** Equirectangular distance in meters; plenty accurate at city scale. */
export function distanceM(a: LatLngLike, b: LatLngLike): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * Default ("Featured") list order: nearest to the map view first, so the first
 * cards match what the map is centered on instead of the API's own order.
 * Stable for equal distances; returns a new array.
 */
export function sortByDistanceTo<T extends LatLngLike>(
  items: T[],
  center: LatLngLike | undefined,
): T[] {
  if (!center) return items.slice();
  return items
    .map((item, index) => ({ item, index, d: distanceM(center, item) }))
    .sort((a, b) => a.d - b.d || a.index - b.index)
    .map((entry) => entry.item);
}

/** Message for a list that is empty while the map still shows grouped homes. */
export function groupedHomesHint(groupedCount: number): string | undefined {
  if (groupedCount <= 0) return undefined;
  return `Zoom in to load individual homes. ${groupedCount.toLocaleString("en-US")} homes are grouped into clusters on the map at this zoom.`;
}
