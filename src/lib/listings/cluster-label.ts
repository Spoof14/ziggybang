import type { MapCluster } from "./types";
import type { MapListing } from "./types";
import { type Lang, formatCount, t } from "~/lib/i18n";

export function clusterShowsUncertainty(
  cluster: Pick<MapCluster, "unfilteredCount" | "countUncertain" | "countMax" | "count">,
): boolean {
  return Boolean(cluster.countUncertain || (cluster.unfilteredCount ?? 0) > 0);
}

/** Label shown on the map bubble (never a misleading exact total when uncertain). */
export function clusterBubbleLabel(
  cluster: Pick<MapCluster, "count" | "countUncertain" | "countMax" | "unfilteredCount">,
  lang: Lang = "en",
): string {
  const uncertain = clusterShowsUncertainty(cluster);
  if (!uncertain) return formatCount(cluster.count, lang);
  if (cluster.count > 0 && cluster.countMax && cluster.count < cluster.countMax) {
    return formatCount(cluster.count, lang);
  }
  const cap = cluster.countMax ?? cluster.count;
  if (cap > 0) return `≤${formatCount(cap, lang)}`;
  return "?";
}

export function clusterBubbleHint(
  cluster: Pick<MapCluster, "count" | "countUncertain" | "countMax" | "unfilteredCount" | "id">,
  lang: Lang = "en",
): string {
  if (!clusterShowsUncertainty(cluster)) {
    return t(lang, "map.clusterHomes", { n: formatCount(cluster.count, lang) });
  }
  if (cluster.count > 0 && !(cluster.countMax && cluster.count < cluster.countMax)) {
    return t(lang, "map.clusterVerifiedPartial", { n: String(cluster.count) });
  }
  return t(lang, "map.clusterApproximate");
}

export function listingRowToClusterFields(
  listing: MapListing,
): Pick<MapCluster, "countUncertain" | "countMax" | "unfilteredCount"> {
  return {
    countUncertain: listing.countUncertain,
    countMax: listing.countMax,
    unfilteredCount: listing.unfiltered ? listing.count : undefined,
  };
}