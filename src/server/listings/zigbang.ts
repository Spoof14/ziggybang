import { containsPoint } from "~/lib/geo/bounds";
import {
  geohashesInBounds,
  precisionForZoom,
} from "~/lib/geo/geohash";
import { needsListingDetails } from "~/lib/listings/filter";
import { type AreaBucketId } from "~/lib/listings/area";
import {
  type Bounds,
  type MapListing,
  type PropertyType,
  type SalesType,
} from "~/lib/listings/types";
import { cached } from "./cache";
import { fetchJson } from "./http";

const ZIGBANG_ORIGIN = "https://apis.zigbang.com";
const TILE_TTL_MS = 5 * 60 * 1000;
const MAX_TILES = 12;

type ZigbangMarker = {
  id?: number;
  lat?: number;
  lng?: number;
  userNo?: number;
  buildingId?: number;
};

type ZigbangTileResponse = {
  items?: ZigbangMarker[];
};

type ZigbangComplex = {
  areaDanjiId?: number;
  lat?: number;
  lng?: number;
  itemIds?: string[];
};

type ZigbangApartmentResponse = {
  recommendItems?: ZigbangComplex[];
  items?: ZigbangComplex[];
};

type ZigbangPrice = {
  deposit?: number;
  rent?: number;
  sellPrice?: number;
};

type ZigbangItemDetail = {
  item?: {
    itemId?: number;
    title?: string;
    salesType?: string;
    serviceType?: string;
    roomType?: string;
    jibunAddress?: string;
    imageThumbnail?: string;
    images?: Array<{ url?: string } | string>;
    imageCount?: number;
    description?: string;
    updatedAt?: string;
    price?: ZigbangPrice;
    location?: { lat?: number; lng?: number };
    area?: Record<string, number>;
    floor?: { floor?: string; allFloors?: string };
    manageCost?: { amount?: number };
    addressOrigin?: { fullText?: string; localText?: string };
  };
};

const verticalByType: Record<
  Exclude<PropertyType, "apartment">,
  "onerooms" | "villas" | "officetels"
> = {
  oneroom: "onerooms",
  villa: "villas",
  officetel: "officetels",
};

export function zigbangItemImageUrl(itemId: string | number, index = 1): string {
  return `https://ic.zigbang.com/ic/items/${itemId}/${index}.jpg`;
}

function zigbangPhotos(
  item: NonNullable<ZigbangItemDetail["item"]>,
  itemId: string | number,
): string[] {
  const fromApi = (item.images ?? [])
    .map((image) => (typeof image === "string" ? image : image.url))
    .filter((url): url is string => Boolean(url))
    .map((url) => (url.startsWith("//") ? `https:${url}` : url));
  if (fromApi.length) return [...new Set(fromApi)];
  const count = Math.min(Math.max(item.imageCount ?? 6, 1), 12);
  return Array.from({ length: count }, (_, index) =>
    zigbangItemImageUrl(itemId, index + 1),
  );
}

function normalizeZigbangThumbnail(
  raw: string | undefined,
  itemId: string | number,
): string {
  if (!raw) return zigbangItemImageUrl(itemId);
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `https://ic.zigbang.com${raw}`;
  return raw;
}

export function zigbangListingUrl(
  propertyType: PropertyType,
  sourceId: string,
): string {
  if (propertyType === "apartment") {
    return `https://www.zigbang.com/home/apt/danjis/${sourceId}`;
  }
  const path =
    propertyType === "officetel"
      ? "officetel"
      : propertyType === "villa"
        ? "villa"
        : "oneroom";
  return `https://www.zigbang.com/home/${path}/items/${sourceId}`;
}

function toMarker(
  item: ZigbangMarker,
  propertyType: Exclude<PropertyType, "apartment">,
): MapListing | null {
  if (
    typeof item.id !== "number" ||
    typeof item.lat !== "number" ||
    typeof item.lng !== "number"
  ) {
    return null;
  }

  return {
    id: `zigbang:${propertyType}:${item.id}`,
    source: "zigbang",
    sourceId: String(item.id),
    lat: item.lat,
    lng: item.lng,
    propertyType,
    thumbnail: zigbangItemImageUrl(item.id),
    url: zigbangListingUrl(propertyType, String(item.id)),
  };
}

function toComplex(item: ZigbangComplex): MapListing | null {
  if (
    typeof item.areaDanjiId !== "number" ||
    typeof item.lat !== "number" ||
    typeof item.lng !== "number"
  ) {
    return null;
  }

  return {
    id: `zigbang:apartment:${item.areaDanjiId}`,
    source: "zigbang",
    sourceId: String(item.areaDanjiId),
    lat: item.lat,
    lng: item.lng,
    propertyType: "apartment",
    title: `Apartment complex ${item.areaDanjiId}`,
    count: item.itemIds?.length ?? 1,
    url: zigbangListingUrl("apartment", String(item.areaDanjiId)),
  };
}

async function fetchVerticalTile(
  vertical: "onerooms" | "villas" | "officetels",
  geohash: string,
): Promise<ZigbangMarker[]> {
  return cached(`zb:${vertical}:${geohash}`, TILE_TTL_MS, async () => {
    const data = await fetchJson<ZigbangTileResponse>(
      `${ZIGBANG_ORIGIN}/house/property/v1/items/${vertical}?geohash=${geohash}&domain=zigbang`,
      { timeoutMs: 10000 },
    );
    return data.items ?? [];
  });
}

async function fetchApartmentTile(geohash: string): Promise<ZigbangComplex[]> {
  return cached(`zb:apt:${geohash}`, TILE_TTL_MS, async () => {
    const data = await fetchJson<ZigbangApartmentResponse>(
      `${ZIGBANG_ORIGIN}/v2/aparts/items?domain=zigbang&geohash=${geohash}`,
      { timeoutMs: 10000 },
    );
    return [...(data.recommendItems ?? []), ...(data.items ?? [])];
  });
}

export async function fetchZigbangListings(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  query?: string;
  areaBucketIds?: AreaBucketId[];
  needsDetails?: boolean;
}): Promise<MapListing[]> {
  const precision = precisionForZoom(input.zoom);
  const tiles = geohashesInBounds(input.bounds, precision, MAX_TILES);
  const types = input.propertyTypes;
  const listings: MapListing[] = [];

  const jobs: Array<() => Promise<void>> = [];

  for (const type of types) {
    if (type === "apartment") {
      for (const tile of tiles) {
        jobs.push(async () => {
          const items = await fetchApartmentTile(tile);
          for (const item of items) {
            const listing = toComplex(item);
            if (
              listing &&
              containsPoint(input.bounds, listing.lat, listing.lng)
            ) {
              listings.push(listing);
            }
          }
        });
      }
      continue;
    }

    const vertical = verticalByType[type];
    for (const tile of tiles) {
      jobs.push(async () => {
        const items = await fetchVerticalTile(vertical, tile);
        for (const item of items) {
          const listing = toMarker(item, type);
          if (
            listing &&
            containsPoint(input.bounds, listing.lat, listing.lng)
          ) {
            listings.push(listing);
          }
        }
      });
    }
  }

  await runPool(jobs, 8);
  const shouldHydrate =
    input.needsDetails ??
    (input.zoom >= 15 &&
      needsListingDetails({
        salesTypes: input.salesTypes ?? [],
        areaBucketIds: input.areaBucketIds ?? [],
        query: input.query ?? "",
      }));
  if (shouldHydrate) {
    return hydrateZigbangListings(listings);
  }
  return listings;
}

const HYDRATE_LIMIT = 120;

export async function hydrateZigbangListings(
  listings: MapListing[],
): Promise<MapListing[]> {
  const targets = listings
    .map((listing, index) => ({ listing, index }))
    .filter(
      ({ listing }) =>
        listing.source === "zigbang" &&
        listing.propertyType !== "apartment" &&
        !listing.salesType,
    )
    .slice(0, HYDRATE_LIMIT);

  const next = listings.slice();
  await runPool(
    targets.map(({ listing, index }) => async () => {
      try {
        const detail = await fetchZigbangDetail(
          listing.sourceId,
          listing.propertyType,
        );
        next[index] = {
          ...listing,
          ...detail,
          id: listing.id,
          lat: listing.lat,
          lng: listing.lng,
          url: listing.url,
        };
      } catch {
        /* keep the map pin even if details fail */
      }
    }),
    8,
  );
  return next;
}

async function runPool(jobs: Array<() => Promise<void>>, limit: number) {
  let index = 0;
  async function worker() {
    while (index < jobs.length) {
      const current = index;
      index += 1;
      const job = jobs[current];
      if (job) await job();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, () => worker()),
  );
}

export function mapZigbangSalesType(value?: string): MapListing["salesType"] {
  if (value === "전세") return "jeonse";
  if (value === "월세") return "wolse";
  if (value === "매매") return "sale";
  return undefined;
}

export function mapZigbangPropertyType(value?: string): PropertyType {
  if (value === "빌라") return "villa";
  if (value === "오피스텔") return "officetel";
  if (value === "아파트") return "apartment";
  return "oneroom";
}

export async function fetchZigbangDetail(
  sourceId: string,
  propertyType: PropertyType,
): Promise<MapListing & { description?: string; manageCost?: number; roomType?: string; updatedAt?: string }> {
  if (propertyType === "apartment") {
    return {
      id: `zigbang:apartment:${sourceId}`,
      source: "zigbang",
      sourceId,
      lat: 0,
      lng: 0,
      propertyType,
      title: `Apartment complex ${sourceId}`,
      url: zigbangListingUrl("apartment", sourceId),
    };
  }

  return cached(`zb:detail:${propertyType}:${sourceId}`, TILE_TTL_MS, async () => {
    const data = await fetchJson<ZigbangItemDetail>(
      `${ZIGBANG_ORIGIN}/v3/items/${sourceId}`,
      { timeoutMs: 8000 },
    );
    const item = data.item;
    if (!item?.itemId) {
      throw new Error(`Zigbang item ${sourceId} was not found`);
    }

    const area = item.area
      ? Object.values(item.area).find((value) => typeof value === "number")
      : undefined;

    return {
      id: `zigbang:${propertyType}:${item.itemId}`,
      source: "zigbang",
      sourceId: String(item.itemId),
      lat: item.location?.lat ?? 0,
      lng: item.location?.lng ?? 0,
      propertyType: mapZigbangPropertyType(item.serviceType) || propertyType,
      salesType: mapZigbangSalesType(item.salesType),
      title: item.title,
      deposit: item.price?.deposit,
      rent: item.price?.rent,
      price: item.price?.sellPrice,
      areaM2: area,
      floor:
        item.floor?.floor && item.floor.allFloors
          ? `${item.floor.floor}/${item.floor.allFloors}`
          : item.floor?.floor,
      address: item.addressOrigin?.fullText ?? item.jibunAddress,
      thumbnail: normalizeZigbangThumbnail(item.imageThumbnail, item.itemId),
      photos: zigbangPhotos(item, item.itemId),
      url: zigbangListingUrl(propertyType, String(item.itemId)),
      description: item.description,
      manageCost: item.manageCost?.amount,
      roomType: item.roomType,
      updatedAt: item.updatedAt,
    };
  });
}

export {
  toMarker as zigbangMarkerToListing,
  toComplex as zigbangComplexToListing,
};
