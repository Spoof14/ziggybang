import { type AgeFilter } from "./age";
import { type FloorFilter } from "./floor";

export const sources = ["zigbang", "naver", "peterpan"] as const;
export type Source = (typeof sources)[number];

export const propertyTypes = [
  "oneroom",
  "villa",
  "officetel",
  "apartment",
] as const;
export type PropertyType = (typeof propertyTypes)[number];

export const salesTypes = ["jeonse", "wolse", "sale"] as const;
export type SalesType = (typeof salesTypes)[number];

export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type MapQuery = {
  bounds: Bounds;
  zoom: number;
  sources: Source[];
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  query?: string;
  areaBucketIds?: Array<"xs" | "s" | "m" | "l">;
  circle?: {
    lat: number;
    lng: number;
    radiusM: number;
  };
  polygon?: Array<{ lat: number; lng: number }>;
  includeListings?: boolean;
  listingLimit?: number;
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  foreignerOk?: boolean;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  maxBuildingAge?: number;
};

export type MapListing = {
  id: string;
  source: Source;
  sourceId: string;
  lat: number;
  lng: number;
  propertyType: PropertyType;
  salesType?: SalesType;
  title?: string;
  deposit?: number;
  rent?: number;
  price?: number;
  areaM2?: number;
  floor?: string;
  address?: string;
  thumbnail?: string;
  url: string;
  count?: number;
  description?: string;
  manageCost?: number;
  roomType?: string;
  updatedAt?: string;
  approveDate?: string;
  photos?: string[];
  foreignerOk?: boolean;
};

export type MapCluster = {
  id: string;
  lat: number;
  lng: number;
  count: number;
  sources: Partial<Record<Source, number>>;
};

export type SourceError = {
  source: Source;
  message: string;
};

export type MapData = {
  mode: "clusters" | "markers";
  clusters: MapCluster[];
  listings: MapListing[];
  stats: {
    zigbang: number;
    naver: number;
    peterpan: number;
    returned: number;
    truncated: boolean;
  };
  errors: SourceError[];
};

export type ListingAgent = {
  name?: string;
  office?: string;
  phone?: string;
  mobile?: string;
  address?: string;
};

export type ListingSubway = {
  name: string;
  line?: string;
};

export type ListingNearby = {
  type: string;
  meters: number;
  walkMinutes?: number;
};

export type ListingDetail = MapListing & {
  parking?: string;
  elevator?: boolean;
  bathrooms?: number;
  moveIn?: string;
  approveDate?: string;
  direction?: string;
  options?: string[];
  manageIncludes?: string[];
  manageExcludes?: string[];
  residenceType?: string;
  agent?: ListingAgent;
  subways?: ListingSubway[];
  amenities?: string[];
  nearby?: ListingNearby[];
};
