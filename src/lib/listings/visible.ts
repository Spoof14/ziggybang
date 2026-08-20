import { clusterListings, cellSizeForZoom, shouldCluster } from "~/lib/geo/cluster";
import { listingInArea, type CircleFilter, type LatLng } from "~/lib/geo/shape";
import { areaBuckets, type AreaBucketId } from "./area";
import {
  filterListings,
  isAllPropertyTypes,
  isDefaultRentSales,
  needsHydratedFilters,
  needsListingDetails,
} from "./filter";
import { describePriceFilter, type PriceFilter } from "./price";
import { describeBuiltYearFilter } from "./building-age";
import { ageFilterLabel, type AgeFilter } from "./age";
import { floorFilterLabel, type FloorFilter } from "./floor";
import {
  propertyTypeLabel,
  salesTypeFilterLabel,
} from "./copy";
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
} & PriceFilter & { foreignerOk?: boolean; floorFilter?: FloorFilter; ageFilter?: AgeFilter; minBuiltYear?: number };

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
    minBuiltYear: input.minBuiltYear,
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
    minBuiltYear: input.minBuiltYear,
  });
}

export function mapLayersForFilters(
  listings: MapListing[],
  serverClusters: MapCluster[],
  input: VisibleFilterInput,
): { clusters: MapCluster[]; listings: MapListing[] } {
  const matched = listingsMatchingFilters(listings, input);
  const hasArea = Boolean(input.circle ?? (input.polygon && input.polygon.length >= 3));
  const typeFilter = !isAllPropertyTypes(input.propertyTypes);
  const detailFilter = needsHydratedFilters(detailInputOf(input));
  const useFilteredPoints = typeFilter || detailFilter || hasArea;

  if (!useFilteredPoints) {
    return {
      clusters: hasArea ? [] : serverClusters,
      listings: matched,
    };
  }

  if (shouldCluster(input.zoom) && matched.length > 60) {
    return {
      clusters: clusterListings(matched, cellSizeForZoom(input.zoom)),
      listings: matched,
    };
  }

  return { clusters: [], listings: matched };
}

export function describeActiveFilters(input: {
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  foreignerOk?: boolean;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  minBuiltYear?: number;
} & PriceFilter): string | null {
  const parts: string[] = [];
  if (!isAllPropertyTypes(input.propertyTypes) && input.propertyTypes.length) {
    parts.push(input.propertyTypes.map((type) => propertyTypeLabel[type]).join(" · "));
  }
  if (
    input.salesTypes.length &&
    !isDefaultRentSales(input.salesTypes) &&
    input.salesTypes.length < 3
  ) {
    parts.push(input.salesTypes.map((type) => salesTypeFilterLabel[type]).join(" · "));
  }
  if (input.areaBucketIds.length) {
    parts.push(
      areaBuckets
        .filter((bucket) => input.areaBucketIds.includes(bucket.id))
        .map((bucket) => bucket.label)
        .join(" · "),
    );
  }
  const price = describePriceFilter(input);
  if (price) parts.push(price);
  if (input.foreignerOk) parts.push("Foreigners welcome");
  if (input.floorFilter) parts.push(floorFilterLabel[input.floorFilter]);
  if (input.ageFilter) parts.push(ageFilterLabel[input.ageFilter]);
  const built = describeBuiltYearFilter(input.minBuiltYear);
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
  minBuiltYear?: number;
} & PriceFilter): string {
  return [
    input.sources.join(","),
    input.propertyTypes.join(","),
    input.salesTypes.join(","),
    input.areaBucketIds.join(","),
    input.query,
    input.foreignerOk ? "ok" : "",
    input.floorFilter ?? "",
    input.ageFilter ?? "",
    input.minBuiltYear ?? "",
    input.minDeposit ?? "",
    input.maxDeposit ?? "",
    input.minRent ?? "",
    input.maxRent ?? "",
  ].join("|");
}
