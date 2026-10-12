import { type MapCluster, type MapListing, type Source } from "~/lib/listings/types";

export function cellSizeForZoom(zoom: number): number {
  if (zoom >= 16) return 0.002;
  if (zoom >= 15) return 0.004;
  if (zoom >= 14) return 0.008;
  if (zoom >= 13) return 0.016;
  if (zoom >= 12) return 0.03;
  if (zoom >= 10) return 0.06;
  return 0.12;
}

export function shouldCluster(zoom: number, _pointCount?: number, _maxMarkers = 400): boolean {
  return zoom < 15;
}

function isGrouped(listing: MapListing): boolean {
  return listing.source === "naver" && listing.id.startsWith("naver:cluster:");
}

export function clusterListings(
  listings: MapListing[],
  cellSize: number,
): MapCluster[] {
  const buckets = new Map<
    string,
    { lat: number; lng: number; count: number; sources: Partial<Record<Source, number>>; unfiltered: number; grouped: number }
  >();

  for (const listing of listings) {
    const row = Math.floor(listing.lat / cellSize);
    const col = Math.floor(listing.lng / cellSize);
    const key = `${row}:${col}`;
    const existing = buckets.get(key);
    const weight = listing.count ?? 1;
    if (existing) {
      existing.lat += listing.lat * weight;
      existing.lng += listing.lng * weight;
      existing.count += weight;
      existing.sources[listing.source] =
        (existing.sources[listing.source] ?? 0) + weight;
      if (listing.unfiltered) existing.unfiltered += weight;
      if (isGrouped(listing)) existing.grouped += weight;
    } else {
      buckets.set(key, {
        lat: listing.lat * weight,
        lng: listing.lng * weight,
        count: weight,
        sources: { [listing.source]: weight },
        unfiltered: listing.unfiltered ? weight : 0,
        grouped: isGrouped(listing) ? weight : 0,
      });
    }
  }

  return [...buckets.entries()].map(([key, bucket]) => ({
    id: `cluster:${key}`,
    lat: bucket.lat / bucket.count,
    lng: bucket.lng / bucket.count,
    count: bucket.count,
    sources: bucket.sources,
    ...(bucket.unfiltered > 0 ? { unfilteredCount: bucket.unfiltered } : {}),
    ...(bucket.grouped > 0 ? { groupedCount: bucket.grouped } : {}),
  }));
}
