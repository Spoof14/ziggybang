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
import { describeBuildingAgeFilter } from "./building-age";
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

  // City/gu zoom: the server sends clustered counts and an empty home list.
  // Those clusters already match the current query — dropping them is what
  // produced a blank map next to "Naver 0 of 6,000".
  if (shouldCluster(input.zoom) && matched.length === 0 && serverClusters.length) {
    return { clusters: serverClusters, listings: [] };
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
  maxBuildingAge?: number;
  hasPhotos?: boolean;
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
  if (input.hasPhotos) parts.push("Has photos");
  if (input.floorFilter) parts.push(floorFilterLabel[input.floorFilter]);
  if (input.ageFilter) parts.push(ageFilterLabel[input.ageFilter]);
  const built = describeBuildingAgeFilter(input.maxBuildingAge);
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
