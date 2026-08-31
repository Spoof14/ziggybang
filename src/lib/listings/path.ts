import {
  propertyTypes,
  sources,
  type ListingDetail,
  type MapListing,
  type PropertyType,
  type Source,
} from "./types";

export type ListingPath = {
  source: Source;
  propertyType: PropertyType;
  sourceId: string;
};

export function listingPagePath(listing: {
  source: Source;
  propertyType: PropertyType;
  sourceId: string;
}): string {
  return `/listing/${listing.source}/${listing.propertyType}/${encodeURIComponent(listing.sourceId)}`;
}

/** True when the listing page was opened from Ziggybang, so history.back() returns to the map. */
export function cameFromApp(
  historyState: unknown = typeof window === "undefined" ? null : window.history.state,
  referrer = typeof document === "undefined" ? "" : document.referrer,
  origin = typeof window === "undefined" ? "" : window.location.origin,
): boolean {
  const idx = (historyState as { idx?: number } | null)?.idx;
  if (typeof idx === "number" && idx > 0) return true;
  if (!referrer || !origin) return false;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

export function listingMapHref(listing: Pick<MapListing, "lat" | "lng">): string | null {
  if (!hasListingCoords(listing)) return null;
  const params = new URLSearchParams({
    lat: listing.lat.toFixed(4),
    lng: listing.lng.toFixed(4),
    z: "16",
  });
  return `/?${params.toString()}`;
}

export function parseListingPath(input: {
  source?: string;
  propertyType?: string;
  sourceId?: string;
}): ListingPath | null {
  const source = input.source;
  const propertyType = input.propertyType;
  const sourceId = input.sourceId ? decodeURIComponent(input.sourceId) : "";
  if (!source || !isSource(source)) return null;
  if (!propertyType || !isPropertyType(propertyType)) return null;
  if (!sourceId.trim()) return null;
  return { source, propertyType, sourceId: sourceId.trim() };
}

export function listingStorageKey(path: ListingPath): string {
  return `ziggybang:listing:${path.source}:${path.propertyType}:${path.sourceId}`;
}

export function stashListing(listing: MapListing): void {
  try {
    window.sessionStorage.setItem(
      listingStorageKey({
        source: listing.source,
        propertyType: listing.propertyType,
        sourceId: listing.sourceId,
      }),
      JSON.stringify(listing),
    );
  } catch {
    /* private mode */
  }
}

export function readStashedListing(path: ListingPath): MapListing | null {
  try {
    const raw = window.sessionStorage.getItem(listingStorageKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapListing;
    if (parsed?.source !== path.source || parsed.sourceId !== path.sourceId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasListingCoords(listing: Pick<MapListing, "lat" | "lng">): boolean {
  return (
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng) &&
    Math.abs(listing.lat) > 0.1 &&
    Math.abs(listing.lng) > 0.1
  );
}

export type ListingMapLinks = {
  google: string | null;
  kakao: string | null;
  naver: string | null;
};

export function listingMapLinks(
  listing: Pick<MapListing, "lat" | "lng" | "address">,
  title?: string,
): ListingMapLinks {
  const taxi = listing.address?.trim() ?? null;
  const query = hasListingCoords(listing)
    ? `${listing.lat},${listing.lng}`
    : taxi;
  if (!query) {
    return { google: null, kakao: null, naver: null };
  }
  const encoded = encodeURIComponent(query);
  const label = encodeURIComponent((title ?? "Home").trim() || "Home");
  if (hasListingCoords(listing)) {
    return {
      google: `https://www.google.com/maps/search/?api=1&query=${query}`,
      kakao: `https://map.kakao.com/link/map/${label},${listing.lat},${listing.lng}`,
      naver: `https://map.naver.com/p/search/${query}`,
    };
  }
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    kakao: `https://map.kakao.com/?q=${encoded}`,
    naver: `https://map.naver.com/p/search/${encoded}`,
  };
}

export function mergeListingDetail(
  primary: ListingDetail | MapListing | null | undefined,
  fallback: MapListing | null | undefined,
): ListingDetail | null {
  if (!primary && !fallback) return null;
  if (!primary) return (fallback as ListingDetail | undefined) ?? null;
  if (!fallback) return primary;
  const photos = [
    ...new Set(
      [...(primary.photos ?? []), ...(fallback.photos ?? []), primary.thumbnail, fallback.thumbnail].filter(
        (url): url is string => Boolean(url),
      ),
    ),
  ];
  return {
    ...fallback,
    ...omitEmpty(primary),
    lat: hasListingCoords(primary) ? primary.lat : fallback.lat,
    lng: hasListingCoords(primary) ? primary.lng : fallback.lng,
    photos: photos.length ? photos : primary.photos ?? fallback.photos,
    thumbnail: primary.thumbnail ? primary.thumbnail : fallback.thumbnail,
    url: primary.url ? primary.url : fallback.url,
    id: primary.id ? primary.id : fallback.id,
  };
}

function omitEmpty<T extends object>(value: T): Partial<T> {
  const next: Partial<T> = {};
  for (const [key, entry] of Object.entries(value) as Array<[keyof T, T[keyof T]]>) {
    if (entry == null || entry === "" || (Array.isArray(entry) && entry.length === 0)) {
      continue;
    }
    next[key] = entry;
  }
  return next;
}

function isSource(value: string): value is Source {
  return (sources as readonly string[]).includes(value);
}

function isPropertyType(value: string): value is PropertyType {
  return (propertyTypes as readonly string[]).includes(value);
}
