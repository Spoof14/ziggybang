import { clusterListings, shouldCluster, cellSizeForZoom } from "~/lib/geo/cluster";
import { isValidBounds } from "~/lib/geo/bounds";
import {
  boundsAroundCircle,
  boundsAroundPolygon,
  pointInCircle,
  pointInPolygon,
} from "~/lib/geo/shape";
import {
  type ListingDetail,
  type MapData,
  type MapListing,
  type MapQuery,
  type PropertyType,
  type Source,
  salesTypes as allSalesTypes,
} from "~/lib/listings/types";
import { filterListings, needsListingDetails } from "~/lib/listings/filter";
import { parseSearchQuery } from "~/lib/listings/search";
import { settledError, withTimeout } from "./http";
import { fetchNaverDetail, fetchNaverListings } from "./naver";
import { fetchPeterpanDetail, fetchPeterpanListings } from "./peterpan";
import { fetchZigbangDetail, fetchZigbangListings } from "./zigbang";

const MAX_MARKERS = 400;
const NAVER_BUDGET_MS = 2500;
const PETERPAN_BUDGET_MS = 4000;

export type ListingAdapters = {
  zigbang: typeof fetchZigbangListings;
  naver: typeof fetchNaverListings;
  peterpan?: typeof fetchPeterpanListings;
};

const defaultAdapters: ListingAdapters = {
  zigbang: fetchZigbangListings,
  naver: fetchNaverListings,
  peterpan: fetchPeterpanListings,
};

function dedupeListings(listings: MapListing[]): MapListing[] {
  const seen = new Map<string, MapListing>();
  for (const listing of listings) {
    seen.set(listing.id, listing);
  }
  return [...seen.values()];
}

export async function getMapData(
  query: MapQuery,
  adapters: ListingAdapters = defaultAdapters,
): Promise<MapData> {
  if (!isValidBounds(query.bounds)) {
    throw new Error("Invalid map bounds");
  }

  const sources = query.sources.length > 0 ? query.sources : (["zigbang", "naver", "peterpan"] as Source[]);
  const propertyTypes =
    query.propertyTypes.length > 0
      ? query.propertyTypes
      : (["oneroom", "villa", "officetel", "apartment"] as PropertyType[]);
  const selectedSalesTypes =
    query.salesTypes && query.salesTypes.length > 0
      ? query.salesTypes
      : [...allSalesTypes];
  const areaBucketIds = query.areaBucketIds ?? [];
  const { listingQuery } = parseSearchQuery(query.query ?? "");
  const detailFilters = {
    salesTypes: selectedSalesTypes,
    areaBucketIds,
    query: listingQuery,
  };
  const requireDetails =
    (query.zoom >= 15 || Boolean(query.includeListings)) &&
    needsListingDetails(detailFilters);

  const fetchBounds = query.circle
    ? boundsAroundCircle(query.circle)
    : query.polygon && query.polygon.length >= 3
      ? (boundsAroundPolygon(query.polygon) ?? query.bounds)
      : query.bounds;

  if (!isValidBounds(fetchBounds)) {
    throw new Error("Invalid map bounds");
  }

  const jobs: Promise<MapListing[]>[] = [];
  const jobSources: Source[] = [];

  if (sources.includes("zigbang")) {
    jobSources.push("zigbang");
    jobs.push(
      adapters.zigbang({
        bounds: fetchBounds,
        zoom: query.zoom,
        propertyTypes,
        salesTypes: selectedSalesTypes,
        query: listingQuery,
        areaBucketIds,
        needsDetails: requireDetails || Boolean(query.includeListings),
      }),
    );
  }
  if (sources.includes("naver")) {
    jobSources.push("naver");
    jobs.push(
      withTimeout(
        adapters.naver({
          bounds: fetchBounds,
          zoom: query.zoom,
          propertyTypes,
          salesTypes: selectedSalesTypes,
        }),
        NAVER_BUDGET_MS,
        "Naver",
      ),
    );
  }
  if (sources.includes("peterpan")) {
    jobSources.push("peterpan");
    jobs.push(
      withTimeout(
        (adapters.peterpan ?? fetchPeterpanListings)({
          bounds: fetchBounds,
          zoom: query.zoom,
          propertyTypes,
          salesTypes: selectedSalesTypes,
          needsDetails: requireDetails || Boolean(query.includeListings),
        }),
        PETERPAN_BUDGET_MS,
        "Peterpan",
      ),
    );
  }

  const results = await Promise.allSettled(jobs);
  const listings: MapListing[] = [];
  const errors: MapData["errors"] = [];

  results.forEach((result, index) => {
    const source = jobSources[index]!;
    if (result.status === "fulfilled") {
      listings.push(...result.value);
    } else {
      const message = settledError(result) ?? `${source} failed`;
      errors.push({ source, message });
    }
  });

  let unique = filterListings(dedupeListings(listings), {
    ...detailFilters,
    requireDetails,
  });
  const circle = query.circle;
  const polygon = query.polygon;
  if (circle) {
    unique = unique.filter((item) => pointInCircle(item, circle));
  } else if (polygon && polygon.length >= 3) {
    unique = unique.filter((item) => pointInPolygon(item, polygon));
  }
  const zigbang = unique.filter((item) => item.source === "zigbang").length;
  const naver = unique.filter((item) => item.source === "naver").length;
  const peterpan = unique.filter((item) => item.source === "peterpan").length;
  const cluster =
    !query.includeListings &&
    shouldCluster(query.zoom, unique.length, MAX_MARKERS);

  if (cluster) {
    const clusters = clusterListings(unique, cellSizeForZoom(query.zoom));
    return {
      mode: "clusters",
      clusters,
      listings: [],
      stats: {
        zigbang,
        naver,
        peterpan,
        returned: clusters.length,
        truncated: false,
      },
      errors,
    };
  }

  const truncated = unique.length > MAX_MARKERS;
  return {
    mode: "markers",
    clusters: [],
    listings: unique.slice(0, MAX_MARKERS),
    stats: {
      zigbang,
      naver,
      peterpan,
      returned: Math.min(unique.length, MAX_MARKERS),
      truncated,
    },
    errors,
  };
}

export async function getListingDetail(input: {
  source: Source;
  sourceId: string;
  propertyType: PropertyType;
}): Promise<ListingDetail> {
  if (input.source === "zigbang") {
    return fetchZigbangDetail(input.sourceId, input.propertyType);
  }
  if (input.source === "peterpan") {
    return fetchPeterpanDetail(input.sourceId);
  }
  return fetchNaverDetail(input.sourceId);
}
