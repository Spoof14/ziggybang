import { type Bounds } from "~/lib/listings/types";

/**
 * Pick at most `cap` items spread across the box instead of the first `cap` in
 * fetch order (which follows each source's own, non-spatial ordering and can
 * leave a whole side of the map empty). Items are bucketed into a grid and taken
 * round-robin, so sparse areas keep their pins and dense ones are thinned.
 */
export function sampleAcrossBounds<T extends { lat: number; lng: number }>(
  items: T[],
  cap: number,
  bounds: Bounds,
  grid = 8,
): T[] {
  if (items.length <= cap) return items;
  const latSpan = bounds.north - bounds.south || 1;
  const lngSpan = bounds.east - bounds.west || 1;
  const cells = new Map<number, T[]>();
  for (const item of items) {
    const row = Math.min(grid - 1, Math.max(0, Math.floor(((item.lat - bounds.south) / latSpan) * grid)));
    const col = Math.min(grid - 1, Math.max(0, Math.floor(((item.lng - bounds.west) / lngSpan) * grid)));
    const key = row * grid + col;
    const list = cells.get(key);
    if (list) list.push(item);
    else cells.set(key, [item]);
  }
  const queues = [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
  const picked = new Set<T>();
  for (let round = 0; picked.size < cap; round += 1) {
    let any = false;
    for (const queue of queues) {
      const item = queue[round];
      if (item === undefined) continue;
      any = true;
      picked.add(item);
      if (picked.size >= cap) break;
    }
    if (!any) break;
  }
  // Keep the original relative order so lists stay stable.
  return items.filter((item) => picked.has(item));
}
