import { places } from "~/lib/geo/places";
import {
  formatRoomType,
  propertyTypeLabel,
  salesTypeFilterLabel,
} from "./copy";
import { type MapListing } from "./types";

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function englishNeighborhood(address?: string): string | null {
  if (!address) return null;
  let best: { name: string; length: number } | undefined;
  for (const place of places) {
    const english = titleCase(place.names[0] ?? place.id);
    for (const name of place.names) {
      if (!/[가-힣]/.test(name)) continue;
      if (!address.includes(name)) continue;
      if (!best || name.length > best.length) {
        best = { name: english, length: name.length };
      }
    }
  }
  return best?.name ?? null;
}

export function englishCardTitle(listing: MapListing): string {
  const where = englishNeighborhood(listing.address);
  const layout = formatRoomType(listing.roomType);
  const kind = propertyTypeLabel[listing.propertyType];
  const deal = listing.salesType ? salesTypeFilterLabel[listing.salesType] : null;
  const room = layout && layout !== kind ? layout : kind;
  return [where, room, deal].filter(Boolean).join(" · ");
}

export function englishAddressLine(listing: MapListing): string | null {
  const where = englishNeighborhood(listing.address);
  const areaBits = listing.address
    ?.match(/([가-힣]+구)|([A-Za-z-]+-gu)/g)
    ?.join(" ");
  if (where && areaBits && !areaBits.includes(where)) {
    return `${where} · ${areaBits}`;
  }
  return where ?? listing.address ?? null;
}
