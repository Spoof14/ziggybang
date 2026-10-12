import { clusterListings, cellSizeForZoom, shouldCluster } from "~/lib/geo/cluster";
import { listingInArea, type CircleFilter, type LatLng } from "~/lib/geo/shape";
import { DEFAULT_LANG, t, type Lang } from "~/lib/i18n";
import { areaBucketLabel, areaBuckets, type AreaBucketId } from "./area";
import {
  filterListings,
  isAllPropertyTypes,
  isDefaultRentSales,
  needsHydratedFilters,
  needsListingDetails,
} from "./filter";
import { describePriceFilter, type PriceFilter } from "./price";
import { describeBuildingAgeFilter } from "./building-age";
import { ageFilterText, type AgeFilter } from "./age";
import { floorFilterText, type FloorFilter } from "./floor";
import { propertyTypeText, salesTypeFilterText } from "./copy";
import {
  type MapCluster,
  type MapListing,
  type PropertyType,
  type SalesType,
} from "./types";

export type VisibleFilterInput = {
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  query: string;
  circle?: CircleFilter;
  polygon?: LatLng[] | null;
  zoom: number;
} & PriceFilter & { foreignerOk?: boolean; floorFilter?: FloorFilter; ageFilter?: AgeFilter; maxBuildingAge?: number; hasPhotos?: boolean };

function detailInputOf(input: VisibleFilterInput) {
  return {
    salesTypes: input.salesTypes,
    areaBucketIds: input.areaBucketIds,
    query: input.query,
    minDeposit: input.minDeposit,
    maxDeposit: input.maxDeposit,
    minRent: input.minRent,
    maxRent: input.maxRent,
    foreignerOk: input.foreignerOk,
    floorFilter: input.floorFilter,
    ageFilter: input.ageFilter,
    maxBuildingAge: input.maxBuildingAge,
    hasPhotos: input.hasPhotos,
  };
}

export function listingsMatchingFilters(
  listings: MapListing[],
  input: VisibleFilterInput,
): MapListing[] {
  const inArea = listings.filter((listing) =>
    listingInArea(listing, input.circle, input.polygon ?? undefined),
  );
  const details = detailInputOf(input);
  return filterListings(inArea, {
    propertyTypes: input.propertyTypes,
    salesTypes: input.salesTypes,
    areaBucketIds: input.areaBucketIds,
    query: input.query,
    requireDetails:
      (input.zoom >= 15 && needsListingDetails(details)) ||
      needsHydratedFilters(details),
    minDeposit: input.minDeposit,
    maxDeposit: input.maxDeposit,
    minRent: input.minRent,
    maxRent: input.maxRent,
    foreignerOk: input.foreignerOk,
    floorFilter: input.floorFilter,
    ageFilter: input.ageFilter,
    maxBuildingAge: input.maxBuildingAge,
    hasPhotos: input.hasPhotos,
  });
}

export type MapLayerContext = {
  /** Count-only source rows (Naver grouped inventory) behind the server clusters. */
  grouped?: MapListing[];
  /** True when the server capped the individual homes it sent. */
  truncated?: boolean;
};

/**
 * What the map draws. Every bubble is derived from filtered data:
 * - individual homes are filtered here with the same predicate the server uses;
 * - when all homes were loaded, bubbles are rebuilt from those filtered homes
 *   plus the (area-clipped) count-only source rows, so nothing outside the
 *   filters is counted and an empty area draws nothing;
 * - when the server capped the home list (or sent none), its clusters are used
 *   as-is, they were built from the filtered set server-side.
 * Count-only rows that could not take every filter keep `unfiltered` so the
 * bubble can be marked.
 */
export function mapLayersForFilters(
  listings: MapListing[],
  serverClusters: MapCluster[],
  input: VisibleFilterInput,
  context: MapLayerContext = {},
): { clusters: MapCluster[]; listings: MapListing[] } {
  const matched = listingsMatchingFilters(listings, input);
  if (!shouldCluster(input.zoom)) {
    return { clusters: [], listings: matched };
  }

  const grouped = (context.grouped ?? []).filter((row) =>
    listingInArea(row, input.circle, input.polygon ?? undefined),
  );
  const complete = listings.length > 0 && !context.truncated;
  if (!complete) {
    return { clusters: serverClusters, listings: matched };
  }

  if (matched.length > 60 || grouped.length > 0) {
    return {
      clusters: clusterListings([...matched, ...grouped], cellSizeForZoom(input.zoom)),
      listings: matched,
    };
  }
  return { clusters: [], listings: matched };
}

export type LayerSourceCounts = {
  zigbang: number;
  naver: number;
  peterpan: number;
  /** Server total per source when more exist than are drawn. */
  totals: { zigbang?: number; naver?: number; peterpan?: number };
  /** Some Naver count includes homes the active filters would exclude. */
  naverApprox: boolean;
};

/**
 * Header counts from what is actually drawn, so per-source numbers, the
 * "on map" total and the list agree with the bubbles/markers.
 */
export function layerSourceCounts(
  layers: { clusters: MapCluster[]; listings: MapListing[] },
  stats?: { zigbang: number; naver: number; peterpan: number; naverAvailable?: number },
): LayerSourceCounts {
  const drawn = { zigbang: 0, naver: 0, peterpan: 0 };
  let naverApprox = false;
  if (layers.clusters.length) {
    for (const cluster of layers.clusters) {
      drawn.zigbang += cluster.sources.zigbang ?? 0;
      drawn.naver += cluster.sources.naver ?? 0;
      drawn.peterpan += cluster.sources.peterpan ?? 0;
      if ((cluster.unfilteredCount ?? 0) > 0 && (cluster.sources.naver ?? 0) > 0) {
        naverApprox = true;
      }
    }
    return { ...drawn, totals: {}, naverApprox };
  }
  for (const listing of layers.listings) {
    drawn[listing.source] += listing.count ?? 1;
  }
  const totals: LayerSourceCounts["totals"] = {};
  if (stats) {
    if (stats.zigbang > drawn.zigbang) totals.zigbang = stats.zigbang;
    const naverTotal = stats.naverAvailable ?? stats.naver;
    if (naverTotal > drawn.naver) totals.naver = naverTotal;
    if (stats.peterpan > drawn.peterpan) totals.peterpan = stats.peterpan;
  }
  return { ...drawn, totals, naverApprox };
}

export function describeActiveFilters(
  input: {
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  foreignerOk?: boolean;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  maxBuildingAge?: number;
  hasPhotos?: boolean;
} & PriceFilter,
  lang: Lang = DEFAULT_LANG,
): string | null {
  const parts: string[] = [];
  if (!isAllPropertyTypes(input.propertyTypes) && input.propertyTypes.length) {
    parts.push(input.propertyTypes.map((type) => propertyTypeText(lang, type)).join(" · "));
  }
  if (
    input.salesTypes.length &&
    !isDefaultRentSales(input.salesTypes) &&
    input.salesTypes.length < 3
  ) {
    parts.push(input.salesTypes.map((type) => salesTypeFilterText(lang, type)).join(" · "));
  }
  if (input.areaBucketIds.length) {
    parts.push(
      areaBuckets
        .filter((bucket) => input.areaBucketIds.includes(bucket.id))
        .map((bucket) => areaBucketLabel(lang, bucket.id))
        .join(" · "),
    );
  }
  const price = describePriceFilter(input, lang);
  if (price) parts.push(price);
  if (input.foreignerOk) parts.push(t(lang, "chip.foreigner"));
  if (input.hasPhotos) parts.push(t(lang, "chip.photos"));
  if (input.floorFilter) parts.push(floorFilterText(lang, input.floorFilter));
  if (input.ageFilter) parts.push(ageFilterText(lang, input.ageFilter));
  const built = describeBuildingAgeFilter(input.maxBuildingAge, lang);
  if (built) parts.push(built);
  return parts.length ? parts.join(" · ") : null;
}

export function filterKeyOf(input: {
  sources: string[];
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  query: string;
  foreignerOk?: boolean;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  maxBuildingAge?: number;
  hasPhotos?: boolean;
} & PriceFilter): string {
  return [
    input.sources.join(","),
    input.propertyTypes.join(","),
    input.salesTypes.join(","),
    input.areaBucketIds.join(","),
    input.query,
    input.foreignerOk ? "ok" : "",
    input.hasPhotos ? "pics" : "",
    input.floorFilter ?? "",
    input.ageFilter ?? "",
    input.maxBuildingAge ?? "",
    input.minDeposit ?? "",
    input.maxDeposit ?? "",
    input.minRent ?? "",
    input.maxRent ?? "",
  ].join("|");
}
