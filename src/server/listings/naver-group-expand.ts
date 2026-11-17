import { parseSearchQuery } from "~/lib/listings/search";
import {
  filterListings,
  needsListingDetails,
  type ListingFilterInput,
} from "~/lib/listings/filter";
import { type MapListing, type PropertyType, type SalesType, type Bounds } from "~/lib/listings/types";
import { type AreaBucketId } from "~/lib/listings/area";
import { type AgeFilter } from "~/lib/listings/age";
import { type FloorFilter } from "~/lib/listings/floor";
import { salesTypes as allSalesTypes } from "~/lib/listings/types";
import {
  clusterArticlePagesForCount,
  fetchNaverDetail,
  fetchNaverGroupArticles,
  type NaverGroupQuery,
} from "./naver";
import { type ListingDetail } from "~/lib/listings/types";

export type ExpandNaverGroupsInput = {
  groups: Array<{
    sourceId: string;
    lat: number;
    lng: number;
    count?: number;
  }>;
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  areaBucketIds?: AreaBucketId[];
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  maxBuildingAge?: number;
  query?: string;
  foreignerOk?: boolean;
  hasPhotos?: boolean;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  deadlineMs?: number;
  fetchGroup?: (input: NaverGroupQuery) => Promise<MapListing[]>;
  fetchDetail?: (sourceId: string) => Promise<ListingDetail>;
};

const EXPAND_BUDGET_MS = 6500;
const ENRICH_CONCURRENCY = 4;

export function mergeListingDetail(base: MapListing, detail: ListingDetail): MapListing {
  return {
    ...base,
    title: detail.title ?? base.title,
    floor: detail.floor ?? base.floor,
    foreignerOk: detail.foreignerOk ?? base.foreignerOk,
    photos: detail.photos?.length ? detail.photos : base.photos,
    thumbnail: detail.thumbnail ?? base.thumbnail,
    description: detail.description ?? base.description,
    updatedAt: detail.updatedAt ?? base.updatedAt,
    approveDate: detail.approveDate ?? base.approveDate,
    areaM2: detail.areaM2 ?? base.areaM2,
    deposit: detail.deposit ?? base.deposit,
    rent: detail.rent ?? base.rent,
    price: detail.price ?? base.price,
    salesType: detail.salesType ?? base.salesType,
    lat: base.lat || detail.lat,
    lng: base.lng || detail.lng,
  };
}

async function enrichNaverArticlesForDetailFilters(
  articles: MapListing[],
  deadlineMs: number,
  fetchDetail: (sourceId: string) => Promise<ListingDetail>,
): Promise<MapListing[]> {
  const naver = articles.filter((item) => item.source === "naver");
  if (!naver.length) return articles;
  const out = new Map(articles.map((item) => [item.id, item]));
  let index = 0;
  const workers = Array.from({ length: Math.min(ENRICH_CONCURRENCY, naver.length) }, async () => {
    while (index < naver.length) {
      if (Date.now() >= deadlineMs) return;
      const current = naver[index++]!;
      try {
        const detail = await fetchDetail(current.sourceId);
        out.set(current.id, mergeListingDetail(current, detail));
      } catch {
        /* list row may still match text / price */
      }
    }
  });
  await Promise.all(workers);
  return [...out.values()];
}

function filterInputOf(
  input: ExpandNaverGroupsInput,
  listingQuery: string,
): ListingFilterInput {
  return {
    propertyTypes: input.propertyTypes,
    salesTypes: input.salesTypes?.length ? input.salesTypes : [...allSalesTypes],
    areaBucketIds: input.areaBucketIds ?? [],
    query: listingQuery,
    requireDetails: true,
    minDeposit: input.minDeposit,
    maxDeposit: input.maxDeposit,
    minRent: input.minRent,
    maxRent: input.maxRent,
    maxBuildingAge: input.maxBuildingAge,
    foreignerOk: input.foreignerOk,
    hasPhotos: input.hasPhotos,
    floorFilter: input.floorFilter,
    ageFilter: input.ageFilter,
  };
}

/**
 * User-initiated expand: fetch every article for each building, enrich when
 * detail-only filters are active, then apply the full filter set.
 */
export async function expandNaverGroupsFiltered(
  input: ExpandNaverGroupsInput,
): Promise<{ listings: MapListing[]; emptySourceIds: string[] }> {
  const fetchGroup = input.fetchGroup ?? fetchNaverGroupArticles;
  const fetchDetail = input.fetchDetail ?? fetchNaverDetail;
  const deadlineMs = input.deadlineMs ?? Date.now() + EXPAND_BUDGET_MS;
  const { listingQuery } = parseSearchQuery(input.query ?? "");
  const filters = filterInputOf(input, listingQuery);
  const needsDetails = needsListingDetails({
    salesTypes: filters.salesTypes,
    areaBucketIds: filters.areaBucketIds,
    query: listingQuery,
    minDeposit: filters.minDeposit,
    maxDeposit: filters.maxDeposit,
    minRent: filters.minRent,
    maxRent: filters.maxRent,
    foreignerOk: filters.foreignerOk,
    hasPhotos: filters.hasPhotos,
    floorFilter: filters.floorFilter,
    ageFilter: filters.ageFilter,
    maxBuildingAge: filters.maxBuildingAge,
  });

  const pages = await Promise.allSettled(
    input.groups.map((group) => {
      const count = group.count && group.count > 1 ? group.count : 40;
      const pageCount = clusterArticlePagesForCount(count, 20, 8);
      return fetchGroup({
        bounds: input.bounds,
        zoom: input.zoom,
        propertyTypes: input.propertyTypes,
        salesTypes: input.salesTypes,
        areaBucketIds: input.areaBucketIds,
        minDeposit: input.minDeposit,
        maxDeposit: input.maxDeposit,
        minRent: input.minRent,
        maxRent: input.maxRent,
        maxBuildingAge: input.maxBuildingAge,
        sourceId: group.sourceId,
        lat: group.lat,
        lng: group.lng,
        count,
        pages: pageCount,
      });
    }),
  );

  const byGroup = input.groups.map((group, index) => {
    const result = pages[index];
    const articles = result?.status === "fulfilled" ? result.value : [];
    return { group, articles };
  });

  const listings: MapListing[] = [];
  const emptySourceIds: string[] = [];

  for (let groupIndex = 0; groupIndex < byGroup.length; groupIndex++) {
    const { group, articles } = byGroup[groupIndex]!;
    const result = pages[groupIndex];
    const fetchOk = result?.status === "fulfilled";
    let working = articles;
    let filtered = filterListings(working, filters);
    if (!filtered.length && working.length && needsDetails) {
      working = await enrichNaverArticlesForDetailFilters(working, deadlineMs, fetchDetail);
      filtered = filterListings(working, filters);
    }
    if (filtered.length) {
      listings.push(...filtered);
    } else if (fetchOk) {
      emptySourceIds.push(group.sourceId);
    }
  }

  const seen = new Map(listings.map((listing) => [listing.id, listing]));
  return { listings: [...seen.values()], emptySourceIds };
}