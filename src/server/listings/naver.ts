import { boundsCenter, containsPoint } from "~/lib/geo/bounds";
import { detectForeignerOk } from "~/lib/listings/foreigner";
import {
  type Bounds,
  type MapListing,
  type PropertyType,
  type SalesType,
} from "~/lib/listings/types";
import { cached } from "./cache";
import { fetchJson } from "./http";

const NAVER_ORIGIN = "https://m.land.naver.com";
const TILE_TTL_MS = 5 * 60 * 1000;
const NAVER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  referer: "https://m.land.naver.com/",
  accept: "application/json, text/plain, */*",
};

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

type NaverCluster = {
  lat?: number;
  lon?: number;
  lng?: number;
  count?: number;
  cnt?: number;
  lgeo?: string;
};

type NaverClusterResponse = {
  data?: {
    ARTICLE?: NaverCluster[] | Record<string, NaverCluster[]>;
    article?: NaverCluster[];
  };
  ARTICLE?: NaverCluster[];
};

type NaverArticle = {
  atclNo?: string | number;
  atclNm?: string;
  rletTpCd?: string;
  rletTpNm?: string;
  tradTpCd?: string;
  tradTpNm?: string;
  lat?: number;
  lng?: number;
  prc?: number;
  rentPrc?: number;
  hanPrc?: number | string;
  spc1?: number | string;
  spc2?: number | string;
  flrInfo?: string;
  repImgUrl?: string;
};

type NaverArticleResponse = {
  body?: NaverArticle[];
};

function parseDeposit(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/,/g, "").replace("억", "0000");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractClusters(payload: NaverClusterResponse): NaverCluster[] {
  const article = payload.data?.ARTICLE ?? payload.data?.article ?? payload.ARTICLE;
  if (Array.isArray(article)) return article;
  if (article && typeof article === "object") {
    return Object.values(article).flat();
  }
  return [];
}

function clusterToListing(cluster: NaverCluster, index: number): MapListing | null {
  const lat = cluster.lat;
  const lng = cluster.lon ?? cluster.lng;
  const count = cluster.count ?? cluster.cnt ?? 1;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const sourceId = cluster.lgeo ?? `cluster-${index}`;
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

export function articleToListing(article: NaverArticle): MapListing | null {
  if (
    article.atclNo == null ||
    typeof article.lat !== "number" ||
    typeof article.lng !== "number"
  ) {
    return null;
  }

  const sourceId = String(article.atclNo);
  const propertyType = mapNaverPropertyType(article.rletTpCd ?? article.rletTpNm);
  const salesType = mapNaverSalesType(article.tradTpCd ?? article.tradTpNm);
  const area = Number(article.spc2 ?? article.spc1);

  return {
    id: `naver:${propertyType}:${sourceId}`,
    source: "naver",
    sourceId,
    lat: article.lat,
    lng: article.lng,
    propertyType,
    salesType,
    title: article.atclNm,
    deposit: parseDeposit(article.hanPrc) ?? (salesType === "sale" ? undefined : article.prc),
    rent: article.rentPrc,
    price: salesType === "sale" ? article.prc : undefined,
    areaM2: Number.isFinite(area) ? area : undefined,
    floor: article.flrInfo,
    thumbnail: article.repImgUrl
      ? `https://landthumb-phinf.pstatic.net${article.repImgUrl}`
      : undefined,
    url: naverListingUrl(sourceId),
    foreignerOk: detectForeignerOk(article.atclNm),
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

async function fetchClusterList(input: {
  bounds: Bounds;
  zoom: number;
  propertyTypes: PropertyType[];
  salesTypes?: SalesType[];
}): Promise<MapListing[]> {
  const center = boundsCenter(input.bounds);
  const z = naverZoom(input.zoom);
  const key = [
    "nv:cluster",
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
      view: "atcl",
      rletTpCd: propertyQuery(input.propertyTypes),
      tradTpCd: salesQuery(input.salesTypes),
      z: String(z),
      lat: String(center.lat),
      lon: String(center.lng),
      btm: String(input.bounds.south),
      lft: String(input.bounds.west),
      top: String(input.bounds.north),
      rgt: String(input.bounds.east),
      addon: "COMPLEX",
      isOnlyIsale: "false",
    });
    const payload = await fetchJson<NaverClusterResponse>(
      `${NAVER_ORIGIN}/cluster/clusterList?${params.toString()}`,
      { headers: NAVER_HEADERS, timeoutMs: 2500 },
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
  const listings: MapListing[] = [];

  for (let page = 1; page <= 2; page += 1) {
    const key = [
      "nv:articles",
      z,
      page,
      input.bounds.south.toFixed(3),
      input.bounds.west.toFixed(3),
      input.bounds.north.toFixed(3),
      input.bounds.east.toFixed(3),
      propertyQuery(input.propertyTypes),
      salesQuery(input.salesTypes),
    ].join(":");

    const pageItems = await cached(key, TILE_TTL_MS, async () => {
      const params = new URLSearchParams({
        rletTpCd: propertyQuery(input.propertyTypes),
        tradTpCd: salesQuery(input.salesTypes),
        z: String(z),
        lat: String(center.lat),
        lon: String(center.lng),
        btm: String(input.bounds.south),
        lft: String(input.bounds.west),
        top: String(input.bounds.north),
        rgt: String(input.bounds.east),
        page: String(page),
      });
      const payload = await fetchJson<NaverArticleResponse>(
        `${NAVER_ORIGIN}/cluster/ajax/articleList?${params.toString()}`,
        { headers: NAVER_HEADERS, timeoutMs: 2500 },
      );
      return (payload.body ?? [])
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
  const listings =
    input.zoom >= 15
      ? await fetchArticleList(input)
      : await fetchClusterList(input);

  return listings.filter((listing) =>
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
