import { salesTypes, type MapListing, type SalesType } from "./types";
import {
  isAllAreaBuckets,
  listingMatchesArea,
  type AreaBucketId,
} from "./area";
import { listingMatchesQuery } from "./search";

export function isAllSalesTypes(selected: SalesType[]): boolean {
  if (selected.length === 0) return true;
  return salesTypes.every((type) => selected.includes(type));
}

export function filterBySalesTypes(
  listings: MapListing[],
  selected: SalesType[],
  requireType = false,
): MapListing[] {
  if (isAllSalesTypes(selected)) return listings;
  return listings.filter((listing) => {
    if (!listing.salesType) return !requireType;
    return selected.includes(listing.salesType);
  });
}

export function filterListings(
  listings: MapListing[],
  input: {
    salesTypes: SalesType[];
    areaBucketIds: AreaBucketId[];
    query: string;
    requireDetails: boolean;
  },
): MapListing[] {
  return listings.filter((listing) => {
    if (!filterBySalesTypes([listing], input.salesTypes, input.requireDetails).length) {
      return false;
    }
    if (
      !listingMatchesArea(
        listing.areaM2,
        input.areaBucketIds,
        input.requireDetails && !isAllAreaBuckets(input.areaBucketIds),
      )
    ) {
      return false;
    }
    if (input.query && !listingMatchesQuery(listing, input.query)) {
      return false;
    }
    return true;
  });
}

export function needsListingDetails(input: {
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  query: string;
}): boolean {
  return (
    !isAllSalesTypes(input.salesTypes) ||
    !isAllAreaBuckets(input.areaBucketIds) ||
    Boolean(input.query.trim())
  );
}
