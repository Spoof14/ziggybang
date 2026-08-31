import { boundsCenter, containsPoint } from "~/lib/geo/bounds";
import { detectForeignerOk } from "~/lib/listings/foreigner";
import {
  type Bounds,
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
  if (transport === "proxy") return 12000;
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
  atclCfmYmd?: string;
  articleConfirmYmd?: string;
};

type NaverArticleResponse = {
  body?: NaverArticle[];
  articleList?: NaverArticle[];
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

function articleCoord(article: NaverArticle): { lat: number; lng: number } | null {
  const lat = asCoord(article.latitude) ?? asCoord(article.lat);
  const lng = asCoord(article.longitude) ?? asCoord(article.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function thumbnailUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `https://landthumb-phinf.pstatic.net${path}`;
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
    thumbnail: thumbnailUrl(article.repImgUrl ?? article.representativeImgUrl),
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

function nearestRegion(regions: NaverRegion[], lat: number, lng: number): NaverRegion | undefined {
  let best: NaverRegion | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    if (typeof region.centerLat !== "number" || typeof region.centerLon !== "number") continue;
    const dlat = region.centerLat - lat;
    const dlng = region.centerLon - lng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < bestDist) {
      best = region;
      bestDist = dist;
    }
  }
  return best;
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
 * bounding box. Walk 시도 → 구 → 동 using cached region lists and pick the
 * nearest centre to the viewport.
 */
export async function cortarNoForPoint(
  lat: number,
  lng: number,
  zoom: number,
): Promise<string | undefined> {
  const z = naverZoom(zoom);
  const sidos = await listRegions(ROOT_CORTAR);
  const sido = nearestRegion(sidos, lat, lng);
  if (!sido) return undefined;
  if (z <= 11) return sido.cortarNo;

  const gus = await listRegions(sido.cortarNo);
  const gu = nearestRegion(gus, lat, lng) ?? sido;
  if (z <= 14) return gu.cortarNo;

  const dongs = await listRegions(gu.cortarNo);
  return nearestRegion(dongs, lat, lng)?.cortarNo ?? gu.cortarNo;
}

async function fetchClusterList(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
}): Promise<MapListing[]> {
  const center = boundsCenter(input.bounds);
  const z = naverZoom(input.zoom);
  const cortarNo = await cortarNoForPoint(center.lat, center.lng, input.zoom);
  if (!cortarNo) return [];

  const key = [
    "nv:cluster",
    cortarNo,
    z,
    input.bounds.south.toFixed(3),
    input.bounds.west.toFixed(3),
    input.bounds.north.toFixed(3),
    input.bounds.east.toFixed(3),
    propertyQuery(input.propertyTypes),
    salesQuery(input.salesTypes),
  ].join(":");

  return cached(key, TILE_TTL_MS, async () => {
    const params = new URLSearchParams({
      cortarNo,
      zoom: String(z),
      priceType: "RETAIL",
      realEstateType: propertyQuery(input.propertyTypes),
      tradeType: salesQuery(input.salesTypes),
      leftLon: String(input.bounds.west),
      rightLon: String(input.bounds.east),
      topLat: String(input.bounds.north),
      bottomLat: String(input.bounds.south),
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

async function fetchArticleList(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
}): Promise<MapListing[]> {
  const center = boundsCenter(input.bounds);
  const z = naverZoom(input.zoom);
  const cortarNo = await cortarNoForPoint(center.lat, center.lng, input.zoom);
  if (!cortarNo) return [];

  const listings: MapListing[] = [];

  for (let page = 1; page <= 2; page += 1) {
    const key = [
      "nv:articles",
      cortarNo,
      z,
      page,
      propertyQuery(input.propertyTypes),
      salesQuery(input.salesTypes),
    ].join(":");

    const pageItems = await cached(key, TILE_TTL_MS, async () => {
      const params = new URLSearchParams({
        cortarNo,
        order: "rank",
        realEstateType: propertyQuery(input.propertyTypes),
        tradeType: salesQuery(input.salesTypes),
        page: String(page),
      });
      const payload = await naverAuthorizedJson<NaverArticleResponse>(
        `${NEW_LAND_ORIGIN}/api/articles?${params.toString()}`,
        naverRequestTimeoutMs(),
      );
      return (payload.articleList ?? payload.body ?? [])
        .map(articleToListing)
        .filter((item): item is MapListing => item !== null);
    });

    listings.push(...pageItems);
    if (pageItems.length < 20) break;
  }

  return listings;
}

export async function fetchNaverListings(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
}): Promise<MapListing[]> {
  // new.land /api/articles/clusters returns [] below zoom 15, so a city-wide
  // default view showed zero Naver pins with no error. Always load dong-level
  // article rows; the map aggregator still clusters them when zoomed out.
  const listings = await fetchArticleList({
    ...input,
    zoom: Math.max(input.zoom, 15),
  });
  if (listings.length > 0 || input.zoom >= 15) {
    return listings.filter((listing) =>
      containsPoint(input.bounds, listing.lat, listing.lng),
    );
  }
  const clusters = await fetchClusterList(input);
  return clusters.filter((listing) =>
    containsPoint(input.bounds, listing.lat, listing.lng),
  );
}

export async function fetchNaverDetail(sourceId: string): Promise<MapListing> {
  return {
    id: `naver:listing:${sourceId}`,
    source: "naver",
    sourceId,
    lat: 0,
    lng: 0,
    propertyType: "apartment",
    title: `Naver listing ${sourceId}`,
    url: naverListingUrl(sourceId),
  };
}
