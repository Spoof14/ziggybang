import { type MapData } from "./types";

export function mergeMapData(parts: Array<MapData | undefined>): MapData {
  const present = parts.filter((part): part is MapData => part !== undefined);
  const listings = present.flatMap((part) => part.listings);
  const clusters = present.flatMap((part) => part.clusters);
  const errors = present.flatMap((part) => part.errors);
  const zigbang = present.reduce((sum, part) => sum + part.stats.zigbang, 0);
  const naver = present.reduce((sum, part) => sum + part.stats.naver, 0);
  const truncated = present.some((part) => part.stats.truncated);
  const hasMarkers = present.some((part) => part.mode === "markers");

  if (hasMarkers) {
    return {
      mode: "markers",
      clusters,
      listings,
      stats: {
        zigbang,
        naver,
        returned: listings.length || clusters.length,
        truncated,
      },
      errors,
    };
  }

  return {
    mode: "clusters",
    clusters,
    listings: [],
    stats: {
      zigbang,
      naver,
      returned: clusters.length,
      truncated,
    },
    errors,
  };
}
