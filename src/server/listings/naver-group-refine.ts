import { clusterArticlePagesForCount } from "./naver";
import { fetchNaverGroupArticles } from "./naver";
import {
  filterListings,
  isNaverClusterListing,
  type ListingFilterInput,
} from "~/lib/listings/filter";
import { type Bounds } from "~/lib/listings/types";
import { type MapListing, type PropertyType } from "~/lib/listings/types";

const MAX_STREET_REFINE_GROUPS = 12;
const MAX_PIN_FROM_GROUP = 40;

export type NaverGroupRefineContext = {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  detailFilters: Omit<ListingFilterInput, "propertyTypes" | "requireDetails">;
  deadlineMs: number;
  now?: () => number;
  fetchGroup?: typeof fetchNaverGroupArticles;
};

/** Bubbles that still need a tap-to-load article fetch before counts are trustworthy. */
export function uncertainNaverGroup(cluster: MapListing): MapListing {
  const max = cluster.count && cluster.count > 1 ? cluster.count : 1;
  return {
    ...cluster,
    unfiltered: true,
    countUncertain: true,
    countMax: max,
  };
}

/**
 * At street zoom, replace Naver building count-rows with filter-verified counts or
 * real pins when the budget allows. Otherwise mark counts uncertain (≤N / tap).
 */
export async function refineNaverGroupedForDetailFilters(
  grouped: MapListing[],
  context: NaverGroupRefineContext,
): Promise<MapListing[]> {
  if (context.zoom < 15 || !grouped.length) return grouped;
  const limited = grouped.slice(0, MAX_STREET_REFINE_GROUPS);
  const tail = grouped.slice(MAX_STREET_REFINE_GROUPS).map(uncertainNaverGroup);
  const fetchGroup = context.fetchGroup ?? fetchNaverGroupArticles;
  const now = context.now ?? (() => Date.now());
  const filters: ListingFilterInput = {
    propertyTypes: context.propertyTypes,
    ...context.detailFilters,
    requireDetails: true,
  };

  const out: MapListing[] = [...tail];
  for (const cluster of limited) {
    if (now() >= context.deadlineMs) {
      out.push(uncertainNaverGroup(cluster));
      continue;
    }
    const maxCount = cluster.count && cluster.count > 1 ? cluster.count : 1;
    const pages = Math.min(3, clusterArticlePagesForCount(maxCount, 20, 3));
    try {
      const articles = await fetchGroup({
        bounds: context.bounds,
        zoom: context.zoom,
        propertyTypes: context.propertyTypes,
        salesTypes: context.detailFilters.salesTypes,
        areaBucketIds: context.detailFilters.areaBucketIds,
        minDeposit: context.detailFilters.minDeposit,
        maxDeposit: context.detailFilters.maxDeposit,
        minRent: context.detailFilters.minRent,
        maxRent: context.detailFilters.maxRent,
        maxBuildingAge: context.detailFilters.maxBuildingAge,
        sourceId: cluster.sourceId,
        lat: cluster.lat,
        lng: cluster.lng,
        count: maxCount,
        pages,
      });
      const filtered = filterListings(articles, filters);
      if (!filtered.length) continue;
      const pageCap = pages * 20;
      const inventoryKnown = !articles.length || filtered.length < pageCap;
      if (inventoryKnown && filtered.length <= MAX_PIN_FROM_GROUP) {
        out.push(...filtered);
        continue;
      }
      if (inventoryKnown) {
        out.push({
          ...cluster,
          count: filtered.length,
          unfiltered: undefined,
          countUncertain: undefined,
          countMax: undefined,
        });
        continue;
      }
      out.push({
        ...cluster,
        count: filtered.length,
        unfiltered: true,
        countUncertain: true,
        countMax: maxCount,
      });
    } catch {
      out.push(uncertainNaverGroup(cluster));
    }
  }
  return out;
}

export function splitNaverGroupedRows(listings: MapListing[]): {
  homes: MapListing[];
  grouped: MapListing[];
} {
  const homes: MapListing[] = [];
  const grouped: MapListing[] = [];
  for (const item of listings) {
    if (isNaverClusterListing(item)) grouped.push(item);
    else homes.push(item);
  }
  return { homes, grouped };
}