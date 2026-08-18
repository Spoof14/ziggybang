import { containsPoint } from "~/lib/geo/bounds";
import {
  type Bounds,
  type MapListing,
  type PropertyType,
  type SalesType,
} from "~/lib/listings/types";
import { cached } from "./cache";
import { fetchJson } from "./http";

const PETERPAN_API = "https://api.peterpanz.com";
const TILE_TTL_MS = 5 * 60 * 1000;
const LIST_PAGES = 2;
const LIST_PAGE_SIZE = 80;

const PETERPAN_HEADERS = {
  accept: "application/json, text/plain, */*",
  origin: "https://www.peterpanz.com",
  referer: "https://www.peterpanz.com/villa",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const buildingTypeFor: Record<PropertyType, string> = {
  oneroom: "원/투룸",
  villa: "빌라/주택",
  officetel: "오피스텔",
  apartment: "아파트",
};

const contractTypeFor: Record<SalesType, string[]> = {
  jeonse: ["전세"],
  wolse: ["월세", "단기임대"],
  sale: ["매매"],
};

type PeterpanCoord = { latitude?: string; longitude?: string };
type PeterpanHouse = {
  hidx?: number;
  info?: {
    subject?: string;
    thumbnail?: string;
    room_type?: string;
    real_size?: number;
    supplied_size?: number;
  };
  type?: {
    contract_type?: string;
    building_type?: string;
  };
  price?: {
    monthly_fee?: number;
    deposit?: number;
    maintenance_cost?: number;
    price?: number;
  };
  floor?: { target?: number; total?: number; floor_text_detail?: string };
  location?: {
    coordinate?: PeterpanCoord;
    address?: { text?: string };
  };
};

type PeterpanAreaResponse = {
  totalCount?: number;
  houses?: Record<string, Record<string, PeterpanHouse[]> | PeterpanHouse[]>;
};

type PeterpanMarker = {
  hidx?: number;
  location?: { coordinate?: PeterpanCoord };
};

export function peterpanListingUrl(id: string): string {
  return `https://www.peterpanz.com/house/${id}`;
}

export function mapPeterpanPropertyType(value?: string): PropertyType {
  if (value === "오피스텔") return "officetel";
  if (value === "아파트") return "apartment";
  if (value === "원/투룸") return "oneroom";
  return "villa";
}

export function mapPeterpanSalesType(value?: string): SalesType | undefined {
  if (value === "전세") return "jeonse";
  if (value === "월세" || value === "단기임대") return "wolse";
  if (value === "매매") return "sale";
  return undefined;
}

function krwToManwon(krw?: number): number | undefined {
  if (krw == null || !Number.isFinite(krw)) return undefined;
  return Math.round(krw / 10_000);
}

function coord(value?: PeterpanCoord): { lat: number; lng: number } | null {
  const lat = Number(value?.latitude);
  const lng = Number(value?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function buildFilter(
  bounds: Bounds,
  propertyTypes: PropertyType[],
  salesTypes?: SalesType[],
): string {
  const parts = [
    `latitude:${bounds.south}~${bounds.north}`,
    `longitude:${bounds.west}~${bounds.east}`,
    `buildingType;${JSON.stringify(propertyTypes.map((type) => buildingTypeFor[type]))}`,
  ];
  if (salesTypes?.length && salesTypes.length < 3) {
    const contracts = salesTypes.flatMap((type) => contractTypeFor[type]);
    if (contracts.length) {
      parts.push(`contractType;${JSON.stringify(contracts)}`);
    }
  }
  return parts.join("||");
}

function queryString(
  bounds: Bounds,
  zoom: number,
  propertyTypes: PropertyType[],
  salesTypes?: SalesType[],
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams({
    filter: buildFilter(bounds, propertyTypes, salesTypes),
    zoomLevel: String(Math.round(zoom)),
    filter_version: "5.1",
    ...extra,
  });
  return params.toString();
}

export function houseToListing(house: PeterpanHouse): MapListing | null {
  const id = house.hidx;
  const point = coord(house.location?.coordinate);
  if (!id || !point) return null;
  const salesType = mapPeterpanSalesType(house.type?.contract_type);
  const deposit = krwToManwon(house.price?.deposit);
  const rent = krwToManwon(house.price?.monthly_fee);
  const salePrice = krwToManwon(house.price?.price);
  return {
    id: `peterpan:${id}`,
    source: "peterpan",
    sourceId: String(id),
    lat: point.lat,
    lng: point.lng,
    propertyType: mapPeterpanPropertyType(house.type?.building_type),
    salesType,
    title: house.info?.subject,
    deposit: salesType === "sale" ? undefined : deposit,
    rent: salesType === "wolse" ? rent : undefined,
    price: salesType === "sale" ? (salePrice ?? deposit) : undefined,
    areaM2: house.info?.real_size ?? house.info?.supplied_size,
    floor: house.floor?.floor_text_detail,
    address: house.location?.address?.text,
    thumbnail: house.info?.thumbnail,
    photos: house.info?.thumbnail ? [house.info.thumbnail] : undefined,
    url: peterpanListingUrl(String(id)),
    manageCost: krwToManwon(house.price?.maintenance_cost),
    roomType: house.info?.room_type,
  };
}

export function markerToListing(marker: PeterpanMarker): MapListing | null {
  const id = marker.hidx;
  const point = coord(marker.location?.coordinate);
  if (!id || !point) return null;
  return {
    id: `peterpan:${id}`,
    source: "peterpan",
    sourceId: String(id),
    lat: point.lat,
    lng: point.lng,
    propertyType: "villa",
    url: peterpanListingUrl(String(id)),
  };
}

function flattenHouses(payload: PeterpanAreaResponse): PeterpanHouse[] {
  const houses = payload.houses ?? {};
  const out: PeterpanHouse[] = [];
  for (const group of Object.values(houses)) {
    if (Array.isArray(group)) {
      out.push(...group);
      continue;
    }
    if (group && typeof group === "object") {
      for (const value of Object.values(group)) {
        if (Array.isArray(value)) out.push(...value);
      }
    }
  }
  return out;
}

async function fetchHouseList(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
}): Promise<MapListing[]> {
  const listings: MapListing[] = [];
  for (let page = 1; page <= LIST_PAGES; page += 1) {
    const key = [
      "pp:list",
      page,
      input.bounds.south.toFixed(3),
      input.bounds.west.toFixed(3),
      input.bounds.north.toFixed(3),
      input.bounds.east.toFixed(3),
      input.propertyTypes.join(","),
      (input.salesTypes ?? []).join(","),
    ].join(":");
    const pageItems = await cached(key, TILE_TTL_MS, async () => {
      const qs = queryString(input.bounds, input.zoom, input.propertyTypes, input.salesTypes, {
        pageSize: String(LIST_PAGE_SIZE),
        pageIndex: String(page),
        order_by: "price",
      });
      const payload = await fetchJson<PeterpanAreaResponse>(
        `${PETERPAN_API}/houses/area/pc?${qs}`,
        { headers: PETERPAN_HEADERS, timeoutMs: 8000 },
      );
      return flattenHouses(payload)
        .map(houseToListing)
        .filter((item): item is MapListing => item !== null);
    });
    listings.push(...pageItems);
    if (pageItems.length < LIST_PAGE_SIZE) break;
  }
  return listings;
}

async function fetchMarkers(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
}): Promise<MapListing[]> {
  const key = [
    "pp:markers",
    input.zoom,
    input.bounds.south.toFixed(3),
    input.bounds.west.toFixed(3),
    input.bounds.north.toFixed(3),
    input.bounds.east.toFixed(3),
    input.propertyTypes.join(","),
    (input.salesTypes ?? []).join(","),
  ].join(":");
  return cached(key, TILE_TTL_MS, async () => {
    const qs = queryString(input.bounds, input.zoom, input.propertyTypes, input.salesTypes, {
      pageSize: "1",
      pageIndex: "1",
    });
    const payload = await fetchJson<PeterpanMarker[]>(
      `${PETERPAN_API}/houses/markers?${qs}`,
      { headers: PETERPAN_HEADERS, timeoutMs: 8000 },
    );
    return (Array.isArray(payload) ? payload : [])
      .map(markerToListing)
      .filter((item): item is MapListing => item !== null)
      .slice(0, 1200);
  });
}

export async function fetchPeterpanListings(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  needsDetails?: boolean;
}): Promise<MapListing[]> {
  const span = Math.max(
    input.bounds.north - input.bounds.south,
    input.bounds.east - input.bounds.west,
  );
  if (!input.needsDetails && (input.zoom < 13 || span > 0.12)) {
    return [];
  }
  const listings =
    input.zoom >= 15 || input.needsDetails
      ? await fetchHouseList(input)
      : await fetchMarkers(input);
  return listings.filter((listing) =>
    containsPoint(input.bounds, listing.lat, listing.lng),
  );
}

export async function fetchPeterpanDetail(sourceId: string): Promise<MapListing> {
  return {
    id: `peterpan:${sourceId}`,
    source: "peterpan",
    sourceId,
    lat: 0,
    lng: 0,
    propertyType: "villa",
    title: `Peterpan listing ${sourceId}`,
    url: peterpanListingUrl(sourceId),
  };
}
