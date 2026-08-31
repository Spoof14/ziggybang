import { type MapData } from "./types";

export function mergeMapData(parts: Array<MapData | undefined>): MapData {
  const present = parts.filter((part): part is MapData => part !== undefined);
  const listings = present.flatMap((part) => part.listings);
  const clusters = present.flatMap((part) => part.clusters);
  const errors = present.flatMap((part) => part.errors);
  const zigbang = present.reduce((sum, part) => sum + part.stats.zigbang, 0);
  const naver = present.reduce((sum, part) => sum + part.stats.naver, 0);
  const peterpan = present.reduce((sum, part) => sum + part.stats.peterpan, 0);
  const naverAvailable = present.reduce(
    (sum, part) => sum + (part.stats.naverAvailable ?? 0),
    0,
  );
  const truncated = present.some((part) => part.stats.truncated);
  const hasListings = listings.length > 0;

  return {
    mode: hasListings && clusters.length === 0 ? "markers" : clusters.length ? "clusters" : "markers",
    clusters,
    listings,
    stats: {
      zigbang,
      naver,
      peterpan,
      naverAvailable: naverAvailable > naver ? naverAvailable : undefined,
      returned: hasListings ? listings.length : clusters.length,
      truncated,
    },
    errors,
  };
}
