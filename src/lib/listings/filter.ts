import { propertyTypes, salesTypes, type MapListing, type PropertyType, type SalesType } from "./types";
import {
  isAllAreaBuckets,
  listingMatchesArea,
  type AreaBucketId,
} from "./area";
import {
  hasDepositBound,
  hasRentBound,
  isEmptyPriceFilter,
  listingMatchesPrice,
  type PriceFilter,
} from "./price";
import { listingMatchesQuery } from "./search";

export type ListingFilterInput = {
  propertyTypes?: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  query: string;
  requireDetails: boolean;
} & PriceFilter;

export function isAllPropertyTypes(selected: PropertyType[]): boolean {
  if (selected.length === 0) return true;
  return propertyTypes.every((type) => selected.includes(type));
}

export function isAllSalesTypes(selected: SalesType[]): boolean {
  if (selected.length === 0) return true;
  return salesTypes.every((type) => selected.includes(type));
}

/** Product default: jeonse + monthly, sale off. Untyped pins can stay until zoomed in. */
export function isDefaultRentSales(selected: SalesType[]): boolean {
  return (
    selected.length === 2 &&
    selected.includes("jeonse") &&
    selected.includes("wolse")
  );
}

/** Price, size, text, or a non-default sale mix — these need hydrated homes, not clusters. */
export function needsHydratedFilters(
  input: Omit<ListingFilterInput, "requireDetails" | "propertyTypes">,
): boolean {
  const salesTypesForDetails = isDefaultRentSales(input.salesTypes)
    ? [...salesTypes]
    : input.salesTypes;
  return needsListingDetails({ ...input, salesTypes: salesTypesForDetails });
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
  input: ListingFilterInput,
): MapListing[] {
  const types = input.propertyTypes ?? [];
  return listings.filter((listing) => {
    if (!isAllPropertyTypes(types) && !types.includes(listing.propertyType)) {
      return false;
    }
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
    if (
      !listingMatchesPrice(
        listing,
        input,
        input.requireDetails &&
          (hasDepositBound(input) || hasRentBound(input)),
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

export function needsListingDetails(
  input: Omit<ListingFilterInput, "requireDetails">,
): boolean {
  return (
    !isAllSalesTypes(input.salesTypes) ||
    !isAllAreaBuckets(input.areaBucketIds) ||
    Boolean(input.query.trim()) ||
    !isEmptyPriceFilter(input)
  );
}
