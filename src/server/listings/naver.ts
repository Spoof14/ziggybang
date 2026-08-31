import { boundsCenter, containsPoint, expandBounds } from "~/lib/geo/bounds";
import { areaBuckets, isAllAreaBuckets, type AreaBucketId } from "~/lib/listings/area";
import { detectForeignerOk } from "~/lib/listings/foreigner";
import {
  type Bounds,
  type ListingDetail,
  type MapListing,
  type PropertyType,
  type SalesType,
} from "~/lib/listings/types";
import { cached } from "./cache";
import {
  NEW_LAND_ORIGIN,
  naverAuthorizedJson,
  naverProxyUrl,
  naverTransport,
  type NaverTransport,
} from "./naver-session";

export { naverProxyUrl, naverTransport, type NaverTransport };

const TILE_TTL_MS = 5 * 60 * 1000;
const REGION_TTL_MS = 24 * 60 * 60 * 1000;
const ROOT_CORTAR = "0000000000";
/** new.land returns 20 rows per page; extra pages load in parallel. */
export const NAVER_ARTICLE_PAGES = 8;

/**
 * Direct requests hang until timeout when blocked. A proxy adds one hop to
 * Korea plus a session bootstrap; the unlocker adds retries on Bright Data's
 * side, so it gets the most headroom.
 */
export function naverRequestTimeoutMs(transport: NaverTransport = naverTransport()): number {
  if (transport === "proxy") return 4000;
  if (transport === "unlocker") return 6500;
  return 2500;
}

export function naverBudgetMs(transport: NaverTransport = naverTransport()): number {
  if (transport === "direct") return 2500;
  if (transport === "proxy") return 20000;
  return 8000;
}

const naverPropertyCodes: Record<PropertyType, string> = {
  apartment: "APT",
  officetel: "OPST",
  villa: "VL",
  oneroom: "OR",
};

const codeToPropertyType: Record<string, PropertyType> = {
  APT: "apartment",
  OPST: "officetel",
  VL: "villa",
  OR: "oneroom",
  아파트: "apartment",
  오피스텔: "officetel",
  빌라: "villa",
  원룸: "oneroom",
};

export function naverZoom(webZoom: number): number {
  return Math.max(8, Math.min(19, Math.round(webZoom)));
}

/** Administrative region the map should query at this Leaflet zoom. */
export function naverCortarLevel(zoom: number): "sido" | "gu" | "dong" {
  const z = naverZoom(zoom);
  if (z <= 11) return "sido";
  if (z <= 14) return "gu";
  return "dong";
}

/**
 * new.land /api/articles/clusters returns [] below zoom 15. Keep sending at
 * least 15 so a city-wide view still gets pins, while cortarNo follows the
 * real map zoom (gu/sido vs dong).
 */
export function naverClusterZoom(webZoom: number): number {
  return Math.max(15, naverZoom(webZoom));
}

/**
 * Extra article pages are fetched in parallel after page 1, so querying
 * several dongs should not cut how deep we page. A dense dong is ~160 rows.
 */
export function articlePagesForCortarCount(_count: number): number {
  return NAVER_ARTICLE_PAGES;
}

const MAX_NAVER_CORTARS = 4;

export function pickRegionsInView(
  regions: Array<{ cortarNo: string; centerLat?: number; centerLon?: number }>,
  bounds: Bounds,
  limit = MAX_NAVER_CORTARS,
): string[] {
  const usable = regions.filter(
    (region): region is { cortarNo: string; centerLat: number; centerLon: number } =>
      typeof region.centerLat === "number" &&
      Number.isFinite(region.centerLat) &&
      typeof region.centerLon === "number" &&
      Number.isFinite(region.centerLon),
  );
  if (!usable.length) return [];
  const expanded = expandBounds(bounds, 0.2);
  const center = boundsCenter(bounds);
  const inView = usable.filter((region) =>
    containsPoint(expanded, region.centerLat, region.centerLon),
  );
  const pool = inView.length ? inView : usable;
  return [...pool]
    .sort((a, b) => {
      const da =
        (a.centerLat - center.lat) * (a.centerLat - center.lat) +
        (a.centerLon - center.lng) * (a.centerLon - center.lng);
      const db =
        (b.centerLat - center.lat) * (b.centerLat - center.lat) +
        (b.centerLon - center.lng) * (b.centerLon - center.lng);
      return da - db;
    })
    .slice(0, Math.max(1, limit))
    .map((region) => region.cortarNo);
}

export type NaverListingQuery = {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  areaBucketIds?: AreaBucketId[];
  maxBuildingAge?: number;
};

export type NaverMapFetch = {
  listings: MapListing[];
  available?: number;
};

export function naverAreaRange(
  selected?: AreaBucketId[],
): { min: number; max?: number } | null {
  if (!selected?.length || isAllAreaBuckets(selected)) return null;
  const buckets = selected
    .map((id) => areaBuckets.find((bucket) => bucket.id === id))
    .filter((bucket): bucket is (typeof areaBuckets)[number] => Boolean(bucket));
  if (!buckets.length) return null;
  const min = Math.min(...buckets.map((bucket) => bucket.minM2));
  if (buckets.some((bucket) => bucket.maxM2 == null)) return { min };
  return {
    min,
    max: Math.max(...buckets.map((bucket) => bucket.maxM2 ?? min)),
  };
}

export function naverFilterParams(
  input: {
    minDeposit?: number;
    maxDeposit?: number;
    minRent?: number;
    maxRent?: number;
    areaBucketIds?: AreaBucketId[];
    maxBuildingAge?: number;
  },
  options?: { defaults?: boolean },
): Record<string, string> {
  const params: Record<string, string> = options?.defaults
    ? {
        priceType: "RETAIL",
        priceMin: "0",
        priceMax: "900000000",
        rentPriceMin: "0",
        rentPriceMax: "900000000",
        areaMin: "0",
        areaMax: "900000000",
        sameAddressGroup: "false",
      }
    : { priceType: "RETAIL" };
  if (input.minDeposit != null) params.priceMin = String(Math.round(input.minDeposit));
  if (input.maxDeposit != null) params.priceMax = String(Math.round(input.maxDeposit));
  if (input.minRent != null) params.rentPriceMin = String(Math.round(input.minRent));
  if (input.maxRent != null) params.rentPriceMax = String(Math.round(input.maxRent));
  const area = naverAreaRange(input.areaBucketIds);
  if (area) {
    params.areaMin = String(area.min);
    params.areaMax = String(area.max ?? 900000000);
  }
  if (input.maxBuildingAge != null && input.maxBuildingAge > 0 && input.maxBuildingAge < 40) {
    params.recentlyBuildYears = String(Math.round(input.maxBuildingAge));
  }
  return params;
}

export function naverArticleListParams(input: {
  cortarNo: string;
  page: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  areaBucketIds?: AreaBucketId[];
  maxBuildingAge?: number;
}): Record<string, string> {
  return {
    cortarNo: input.cortarNo,
    order: "rank",
    realEstateType: propertyQuery(input.propertyTypes),
    tradeType: salesQuery(input.salesTypes),
    page: String(input.page),
    ...naverFilterParams(input),
  };
}

export function naverFilterCacheKey(input: {
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  areaBucketIds?: AreaBucketId[];
  maxBuildingAge?: number;
}): string {
  return [
    input.minDeposit ?? "",
    input.maxDeposit ?? "",
    input.minRent ?? "",
    input.maxRent ?? "",
    (input.areaBucketIds ?? []).join(","),
    input.maxBuildingAge ?? "",
  ].join(":");
}

export function listingInventoryCount(listings: Array<{ count?: number }>): number {
  return listings.reduce((sum, listing) => sum + (listing.count && listing.count > 1 ? listing.count : 1), 0);
}

export function naverListingUrl(articleNo: string): string {
  return `https://m.land.naver.com/article/info/${articleNo}`;
}

export function mapNaverSalesType(value?: string): SalesType | undefined {
  if (value === "A1" || value === "매매") return "sale";
  if (value === "B1" || value === "전세") return "jeonse";
  if (value === "B2" || value === "월세") return "wolse";
  return undefined;
}

export function mapNaverPropertyType(value?: string): PropertyType {
  if (!value) return "apartment";
  return codeToPropertyType[value] ?? "apartment";
}

export type NaverCluster = {
  lat?: number | string;
  lon?: number | string;
  lng?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  count?: number;
  cnt?: number;
  lgeo?: string;
  markerId?: string;
};

export type NaverClusterResponse = {
  data?: {
    ARTICLE?: NaverCluster[] | Record<string, NaverCluster[]>;
    article?: NaverCluster[];
  };
  ARTICLE?: NaverCluster[];
};

export type NaverArticle = {
  atclNo?: string | number;
  articleNo?: string | number;
  atclNm?: string;
  articleName?: string;
  buildingName?: string;
  rletTpCd?: string;
  rletTpNm?: string;
  realEstateTypeCode?: string;
  realEstateTypeName?: string;
  tradTpCd?: string;
  tradTpNm?: string;
  tradeTypeCode?: string;
  tradeTypeName?: string;
  lat?: number | string;
  lng?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  prc?: number;
  rentPrc?: number | string;
  hanPrc?: number | string;
  dealOrWarrantPrc?: number | string;
  spc1?: number | string;
  spc2?: number | string;
  area1?: number | string;
  area2?: number | string;
  flrInfo?: string;
  floorInfo?: string;
  repImgUrl?: string;
  representativeImgUrl?: string;
  articlePhotos?: NaverArticlePhoto[];
  imageList?: Array<string | NaverArticlePhoto>;
  atclCfmYmd?: string;
  articleConfirmYmd?: string;
};

export type NaverArticlePhoto = {
  imageSrc?: string;
  imageUrl?: string;
  imgUrl?: string;
  url?: string;
  imageType?: string | number;
  imageOrder?: number;
};

type NaverArticleResponse = {
  body?: NaverArticle[];
  articleList?: NaverArticle[];
  isMoreData?: boolean;
  totCnt?: number;
  totalCount?: number;
  mapCount?: number;
};

type NaverRegion = {
  cortarNo: string;
  centerLat: number;
  centerLon: number;
  cortarName?: string;
  cortarType?: string;
};

type NaverRegionResponse = {
  regionList?: NaverRegion[];
};

/** Parse a Naver 만원 amount, including "1억 2,000" strings. */
export function parseNaverManwon(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return undefined;
  const eok = cleaned.match(/(\d+(?:\.\d+)?)\s*억/);
  const rest = cleaned.replace(/(\d+(?:\.\d+)?)\s*억/, "").trim();
  let manwon = 0;
  if (eok?.[1]) manwon += Number(eok[1]) * 10000;
  if (rest) {
    const parsed = Number(rest);
    if (Number.isFinite(parsed)) manwon += parsed;
  }
  return Number.isFinite(manwon) && manwon !== 0 ? manwon : undefined;
}

export function extractClusters(
  payload: NaverClusterResponse | NaverCluster[],
): NaverCluster[] {
  if (Array.isArray(payload)) return payload;
  const article = payload.data?.ARTICLE ?? payload.data?.article ?? payload.ARTICLE;
  if (Array.isArray(article)) return article;
  if (article && typeof article === "object") {
    return Object.values(article).flat();
  }
  return [];
}

export function clusterToListing(cluster: NaverCluster, index: number): MapListing | null {
  const lat = asCoord(cluster.latitude) ?? asCoord(cluster.lat);
  const lng = asCoord(cluster.longitude) ?? asCoord(cluster.lon) ?? asCoord(cluster.lng);
  const count = cluster.count ?? cluster.cnt ?? 1;
  if (lat == null || lng == null) return null;

  const sourceId = cluster.markerId ?? cluster.lgeo ?? `cluster-${index}`;
  return {
    id: `naver:cluster:${sourceId}`,
    source: "naver",
    sourceId,
    lat,
    lng,
    propertyType: "apartment",
    count,
    url: "https://m.land.naver.com/",
  };
}

function asCoord(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function coordsFrom(obj?: {
  latitudeNum?: number | string;
  longitudeNum?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
}): { lat: number; lng: number } | null {
  if (!obj) return null;
  const lat = asCoord(obj.latitudeNum) ?? asCoord(obj.latitude) ?? asCoord(obj.lat);
  const lng =
    asCoord(obj.longitudeNum) ?? asCoord(obj.longitude) ?? asCoord(obj.lng) ?? asCoord(obj.lon);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) < 0.1 || Math.abs(lng) < 0.1) return null;
  return { lat, lng };
}

function naverDetailCoords(
  payload: NaverArticleDetailPayload,
): { lat: number; lng: number } | null {
  return (
    coordsFrom(payload) ??
    coordsFrom(payload.latlng) ??
    coordsFrom(payload.articleDetail) ??
    coordsFrom(payload as NaverArticle)
  );
}

function articleCoord(article: NaverArticle): { lat: number; lng: number } | null {
  const lat = asCoord(article.latitude) ?? asCoord(article.lat);
  const lng = asCoord(article.longitude) ?? asCoord(article.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function thumbnailUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("//")) return `https:${path}`;
  return `https://landthumb-phinf.pstatic.net${path.startsWith("/") ? path : `/${path}`}`;
}

function photoPath(photo: string | NaverArticlePhoto | undefined): string | undefined {
  if (!photo) return undefined;
  if (typeof photo === "string") return photo;
  return photo.imageSrc ?? photo.imageUrl ?? photo.imgUrl ?? photo.url;
}

/** new.land imageType 10 is the 평면도 (floor plan with room dimensions). */
export function isNaverFloorplan(imageType?: string | number): boolean {
  const value = String(imageType ?? "").toUpperCase();
  return value === "10" || value === "F" || value === "FP" || value === "PLAN";
}

export function extractNaverPhotos(article: {
  repImgUrl?: string;
  representativeImgUrl?: string;
  articlePhotos?: NaverArticlePhoto[];
  imageList?: Array<string | NaverArticlePhoto>;
  photos?: NaverArticlePhoto[];
}): string[] {
  const gallery = [
    ...(article.articlePhotos ?? []),
    ...(article.photos ?? []),
    ...(article.imageList ?? []),
  ];
  const ranked = [...gallery].sort((left, right) => {
    if (typeof left === "string" || typeof right === "string") return 0;
    const leftPlan = isNaverFloorplan(left.imageType) ? 0 : 1;
    const rightPlan = isNaverFloorplan(right.imageType) ? 0 : 1;
    if (leftPlan !== rightPlan) return leftPlan - rightPlan;
    return (left.imageOrder ?? 99) - (right.imageOrder ?? 99);
  });
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const photo of ranked) {
    const url = thumbnailUrl(photoPath(photo));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  const thumbnail = thumbnailUrl(article.repImgUrl ?? article.representativeImgUrl);
  if (thumbnail && !seen.has(thumbnail)) urls.push(thumbnail);
  return urls;
}

export function articleToListing(article: NaverArticle): MapListing | null {
  const sourceId = article.articleNo ?? article.atclNo;
  const coord = articleCoord(article);
  if (sourceId == null || !coord) return null;

  const id = String(sourceId);
  const propertyType = mapNaverPropertyType(
    article.realEstateTypeCode ??
      article.rletTpCd ??
      article.realEstateTypeName ??
      article.rletTpNm,
  );
  const salesType = mapNaverSalesType(
    article.tradeTypeCode ?? article.tradTpCd ?? article.tradeTypeName ?? article.tradTpNm,
  );
  const area = Number(article.area2 ?? article.spc2 ?? article.area1 ?? article.spc1);
  const warrant =
    parseNaverManwon(article.hanPrc) ?? parseNaverManwon(article.dealOrWarrantPrc);
  const rent = parseNaverManwon(article.rentPrc);
  const price =
    salesType === "sale"
      ? (parseNaverManwon(article.prc) ?? parseNaverManwon(article.dealOrWarrantPrc))
      : undefined;
  const deposit = warrant ?? (salesType === "sale" ? undefined : parseNaverManwon(article.prc));
  const title = article.articleName ?? article.atclNm ?? article.buildingName;
  const photos = extractNaverPhotos(article);
  const thumbnail = photos[0] ?? thumbnailUrl(article.repImgUrl ?? article.representativeImgUrl);

  return {
    id: `naver:${propertyType}:${id}`,
    source: "naver",
    sourceId: id,
    lat: coord.lat,
    lng: coord.lng,
    propertyType,
    salesType,
    title,
    deposit,
    rent,
    price,
    areaM2: Number.isFinite(area) ? area : undefined,
    floor: article.floorInfo ?? article.flrInfo,
    thumbnail,
    photos: photos.length ? photos : undefined,
    url: naverListingUrl(id),
    foreignerOk: detectForeignerOk(title),
    updatedAt: article.articleConfirmYmd ?? article.atclCfmYmd,
  };
}

const naverSalesCodes: Record<SalesType, string> = {
  sale: "A1",
  jeonse: "B1",
  wolse: "B2",
};

function propertyQuery(types: PropertyType[]): string {
  return types.map((type) => naverPropertyCodes[type]).join(":");
}

function salesQuery(types?: SalesType[]): string {
  const selected = types?.length ? types : (["sale", "jeonse", "wolse"] as SalesType[]);
  return selected.map((type) => naverSalesCodes[type]).join(":");
}

async function listRegions(cortarNo: string): Promise<NaverRegion[]> {
  return cached(`nv:regions:${cortarNo}`, REGION_TTL_MS, async () => {
    const payload = await naverAuthorizedJson<NaverRegionResponse>(
      `${NEW_LAND_ORIGIN}/api/regions/list?cortarNo=${cortarNo}`,
      naverRequestTimeoutMs(),
    );
    return payload.regionList ?? [];
  });
}

/**
 * new.land article/cluster APIs are keyed by 법정동 cortarNo, not only a
 * bounding box. Walk 시도 → 구 → 동 using cached region lists and pick every
 * centre that sits in the viewport (not just the nearest one).
 */
export async function cortarNoForPoint(
  lat: number,
  lng: number,
  zoom: number,
): Promise<string | undefined> {
  const nos = await cortarNosForViewport(
    {
      south: lat - 0.002,
      north: lat + 0.002,
      west: lng - 0.002,
      east: lng + 0.002,
    },
    zoom,
  );
  return nos[0];
}

export async function cortarNosForViewport(bounds: Bounds, zoom: number): Promise<string[]> {
  const level = naverCortarLevel(zoom);
  const sidos = await listRegions(ROOT_CORTAR);
  if (level === "sido") return pickRegionsInView(sidos, bounds, 1);

  const sidoNos = pickRegionsInView(sidos, bounds, 2);
  const gus: NaverRegion[] = [];
  for (const cortarNo of sidoNos) {
    gus.push(...(await listRegions(cortarNo)));
  }
  if (level === "gu") return pickRegionsInView(gus, bounds, MAX_NAVER_CORTARS);

  const guNos = pickRegionsInView(gus, bounds, 2);
  const dongs: NaverRegion[] = [];
  for (const cortarNo of guNos) {
    dongs.push(...(await listRegions(cortarNo)));
  }
  return pickRegionsInView(dongs, bounds, MAX_NAVER_CORTARS);
}

function naverMapParams(bounds: Bounds, zoom: number): Record<string, string> {
  const center = boundsCenter(bounds);
  return {
    zoom: String(naverClusterZoom(zoom)),
    leftLon: String(bounds.west),
    rightLon: String(bounds.east),
    topLat: String(bounds.north),
    bottomLat: String(bounds.south),
    centerLat: String(center.lat),
    centerLon: String(center.lng),
  };
}

function dedupeNaverListings(listings: MapListing[]): MapListing[] {
  const seen = new Map<string, MapListing>();
  for (const listing of listings) {
    seen.set(listing.id, listing);
  }
  return [...seen.values()];
}

/**
 * /api/articles is cortar-scoped, so a dong's rank list includes homes
 * outside the map. Prefer pins on screen; only keep the rest when none of
 * the geocoded rows sit in (or just beside) the viewport — that is the
 * "0 of 88" safety net, not the default.
 */
export function clipNaverListingsToViewport(
  listings: MapListing[],
  bounds: Bounds,
): MapListing[] {
  const exact = listings.filter((listing) =>
    containsPoint(bounds, listing.lat, listing.lng),
  );
  if (exact.length) return exact;
  const nearby = listings.filter((listing) =>
    containsPoint(expandBounds(bounds, 0.15), listing.lat, listing.lng),
  );
  if (nearby.length) return nearby;
  return listings;
}

async function fetchClusterList(input: {
  bounds: Bounds;
  zoom: number;
  cortarNo: string;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  areaBucketIds?: AreaBucketId[];
  maxBuildingAge?: number;
}): Promise<MapListing[]> {
  const z = naverClusterZoom(input.zoom);
  const filters = naverFilterParams(input, { defaults: true });
  const key = [
    "nv:cluster",
    input.cortarNo,
    z,
    input.bounds.south.toFixed(3),
    input.bounds.west.toFixed(3),
    input.bounds.north.toFixed(3),
    input.bounds.east.toFixed(3),
    propertyQuery(input.propertyTypes),
    salesQuery(input.salesTypes),
    naverFilterCacheKey(input),
  ].join(":");

  return cached(key, TILE_TTL_MS, async () => {
    const params = new URLSearchParams({
      cortarNo: input.cortarNo,
      realEstateType: propertyQuery(input.propertyTypes),
      tradeType: salesQuery(input.salesTypes),
      ...filters,
      ...naverMapParams(input.bounds, input.zoom),
    });
    const payload = await naverAuthorizedJson<NaverClusterResponse | NaverCluster[]>(
      `${NEW_LAND_ORIGIN}/api/articles/clusters?${params.toString()}`,
      naverRequestTimeoutMs(),
    );
    return extractClusters(payload)
      .map(clusterToListing)
      .filter((item): item is MapListing => item !== null);
  });
}

function articleListTotal(payload: NaverArticleResponse, itemCount: number): number | undefined {
  const total = payload.totCnt ?? payload.totalCount ?? payload.mapCount;
  if (typeof total === "number" && Number.isFinite(total) && total > 0) return total;
  if (itemCount > 0 && payload.isMoreData === false) return itemCount;
  return undefined;
}

async function fetchArticlePage(input: {
  bounds: Bounds;
  zoom: number;
  cortarNo: string;
  page: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  areaBucketIds?: AreaBucketId[];
  maxBuildingAge?: number;
}): Promise<{ items: MapListing[]; isMore: boolean; total?: number }> {
  const query = naverArticleListParams(input);
  const key = [
    "nv:articles",
    input.cortarNo,
    input.page,
    query.realEstateType,
    query.tradeType,
    naverFilterCacheKey(input),
  ].join(":");

  return cached(key, TILE_TTL_MS, async () => {
    const params = new URLSearchParams(query);
    const payload = await naverAuthorizedJson<NaverArticleResponse>(
      `${NEW_LAND_ORIGIN}/api/articles?${params.toString()}`,
      naverRequestTimeoutMs(),
    );
    const items = (payload.articleList ?? payload.body ?? [])
      .map(articleToListing)
      .filter((item): item is MapListing => item !== null);
    return {
      items,
      isMore: payload.isMoreData ?? items.length >= 20,
      total: articleListTotal(payload, items.length),
    };
  });
}

async function fetchArticleList(input: {
  bounds: Bounds;
  zoom: number;
  cortarNo: string;
  pages?: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
  areaBucketIds?: AreaBucketId[];
  maxBuildingAge?: number;
}): Promise<{ listings: MapListing[]; total?: number }> {
  const maxPages = input.pages ?? NAVER_ARTICLE_PAGES;
  const first = await fetchArticlePage({ ...input, page: 1 });
  const listings = [...first.items];
  let total = first.total;
  if (!first.isMore || maxPages <= 1) return { listings, total };

  const neededPages = total
    ? Math.min(maxPages, Math.max(2, Math.ceil(total / 20)))
    : maxPages;
  const extra = await Promise.all(
    Array.from({ length: neededPages - 1 }, (_, index) =>
      fetchArticlePage({ ...input, page: index + 2 }),
    ),
  );
  for (const page of extra) {
    listings.push(...page.items);
    if (page.total != null) total = Math.max(total ?? 0, page.total);
  }
  return { listings, total };
}

export async function fetchNaverListings(input: NaverListingQuery): Promise<NaverMapFetch> {
  const cortarNos = await cortarNosForViewport(input.bounds, input.zoom);
  if (!cortarNos.length) return { listings: [] };

  const loadClusters = (nos: string[]) =>
    Promise.all(nos.map((cortarNo) => fetchClusterList({ ...input, cortarNo }))).then((groups) =>
      clipNaverListingsToViewport(dedupeNaverListings(groups.flat()), input.bounds),
    );

  const loadArticles = (nos: string[]) =>
    Promise.all(
      nos.map((cortarNo) =>
        fetchArticleList({
          ...input,
          cortarNo,
          pages: articlePagesForCortarCount(nos.length),
        }),
      ),
    ).then((groups) => {
      const fetched = dedupeNaverListings(groups.flatMap((group) => group.listings));
      const reported = groups.reduce((sum, group) => sum + (group.total ?? 0), 0);
      return {
        listings: clipNaverListingsToViewport(fetched, input.bounds),
        reported: reported > 0 ? reported : undefined,
      };
    });

  if (input.zoom >= 15) {
    // Article pins are the ones users can open. Skip clusters unless the
    // list comes back empty — they share the same proxy budget.
    const articles = await loadArticles(cortarNos);
    if (articles.listings.length) {
      const available = Math.max(
        listingInventoryCount(articles.listings),
        articles.reported ?? 0,
        articles.listings.length,
      );
      return {
        listings: articles.listings,
        available: available > 0 ? available : undefined,
      };
    }
    const clusters = await loadClusters(cortarNos);
    return {
      listings: clusters,
      available: listingInventoryCount(clusters) || undefined,
    };
  }

  const clustered = await loadClusters(cortarNos);
  if (clustered.length) {
    return { listings: clustered, available: listingInventoryCount(clustered) };
  }

  const dongNos = await cortarNosForViewport(input.bounds, 15);
  const articles = await loadArticles(dongNos);
  return {
    listings: articles.listings,
    available: Math.max(articles.reported ?? 0, articles.listings.length) || undefined,
  };
}

export async function fetchNaverDetail(sourceId: string): Promise<ListingDetail> {
  return cached(`nv:detail:${sourceId}`, TILE_TTL_MS, async () => {
    const payload = await naverAuthorizedJson<NaverArticleDetailPayload>(
      `${NEW_LAND_ORIGIN}/api/articles/${encodeURIComponent(sourceId)}`,
      naverRequestTimeoutMs(),
    );
    const listing = mapNaverArticleDetail(payload, sourceId);
    if (!listing) {
      throw new Error(`Naver listing ${sourceId} was not found`);
    }
    return listing;
  });
}

type NaverArticleDetailPayload = {
  articleNo?: string | number;
  articleName?: string;
  latitude?: number | string;
  longitude?: number | string;
  latitudeNum?: number | string;
  longitudeNum?: number | string;
  realEstateTypeCode?: string;
  realEstateTypeName?: string;
  tradeTypeCode?: string;
  tradeTypeName?: string;
  exposureAddress?: string;
  featureDesc?: string;
  tagList?: string[];
  articleConfirmYmd?: string;
  repImgUrl?: string;
  representativeImgUrl?: string;
  articlePhotos?: NaverArticlePhoto[];
  photos?: NaverArticlePhoto[];
  imageList?: Array<string | NaverArticlePhoto>;
  articleDetail?: {
    articleNo?: string | number;
    articleName?: string;
    aptName?: string;
    exposureAddress?: string;
    detailDescription?: string;
    roomCount?: string | number;
    bathroomCount?: string | number;
    moveInTypeName?: string;
    aptUseApproveYmd?: string;
    directTrade?: boolean;
    latitude?: number | string;
    longitude?: number | string;
    lat?: number | string;
    lng?: number | string;
  };
  latlng?: {
    lat?: number | string;
    lng?: number | string;
    lon?: number | string;
    latitude?: number | string;
    longitude?: number | string;
  };
  articlePrice?: {
    dealPrice?: number;
    warrantPrice?: number;
    rentPrice?: number;
  };
  articleFloor?: {
    correspondingFloorCount?: string | number;
    totalFloorCount?: string | number;
  };
  articleSpace?: {
    supplySpace?: number;
    exclusiveSpace?: number;
  };
};

export function mapNaverArticleDetail(
  payload: NaverArticleDetailPayload,
  fallbackId: string,
): ListingDetail | null {
  const nested = payload.articleDetail;
  const sourceId = String(nested?.articleNo ?? payload.articleNo ?? fallbackId);
  if (!sourceId || sourceId === "undefined") return null;

  const photos = extractNaverPhotos(payload);
  const coord = naverDetailCoords(payload);
  const lat = coord?.lat;
  const lng = coord?.lng;
  const propertyType = mapNaverPropertyType(
    payload.realEstateTypeCode ?? payload.realEstateTypeName,
  );
  const salesType = mapNaverSalesType(payload.tradeTypeCode ?? payload.tradeTypeName);
  const area = payload.articleSpace?.exclusiveSpace ?? payload.articleSpace?.supplySpace;
  const floor =
    payload.articleFloor?.correspondingFloorCount != null &&
    payload.articleFloor.totalFloorCount != null
      ? `${payload.articleFloor.correspondingFloorCount}/${payload.articleFloor.totalFloorCount}`
      : undefined;
  const title =
    payload.articleName ?? nested?.articleName ?? nested?.aptName ?? `Naver listing ${sourceId}`;
  const description = [nested?.detailDescription, payload.featureDesc, payload.tagList?.join(", ")]
    .filter((part) => part && String(part).trim())
    .join("\n");
  const warrant = payload.articlePrice?.warrantPrice;
  const rent = payload.articlePrice?.rentPrice;
  const deal = payload.articlePrice?.dealPrice;
  const bathrooms = Number(nested?.bathroomCount);
  const rooms = nested?.roomCount != null ? String(nested.roomCount) : undefined;

  return {
    id: `naver:${propertyType}:${sourceId}`,
    source: "naver",
    sourceId,
    lat: lat ?? 0,
    lng: lng ?? 0,
    propertyType,
    salesType,
    title,
    deposit: salesType === "sale" ? undefined : warrant,
    rent: rent && rent > 0 ? rent : undefined,
    price: salesType === "sale" ? deal : undefined,
    areaM2: typeof area === "number" && Number.isFinite(area) ? area : undefined,
    floor,
    address: nested?.exposureAddress ?? payload.exposureAddress,
    thumbnail: photos[0],
    photos: photos.length ? photos : undefined,
    url: naverListingUrl(sourceId),
    description: description || undefined,
    roomType: rooms,
    bathrooms: Number.isFinite(bathrooms) && bathrooms > 0 ? bathrooms : undefined,
    moveIn: nested?.moveInTypeName,
    approveDate: nested?.aptUseApproveYmd,
    foreignerOk: detectForeignerOk(title, description),
    updatedAt: payload.articleConfirmYmd,
  };
}
