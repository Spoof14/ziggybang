import { salesTypes, type MapListing, type SalesType } from "./types";

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
