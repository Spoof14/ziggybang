export const sources = ["zigbang", "naver"] as const;
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
    returned: number;
    truncated: boolean;
  };
  errors: SourceError[];
};

export type ListingDetail = MapListing;
