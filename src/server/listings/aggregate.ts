import { clusterListings, shouldCluster, cellSizeForZoom } from "~/lib/geo/cluster";
import { isValidBounds } from "~/lib/geo/bounds";
import {
  type ListingDetail,
  type MapData,
  type MapListing,
  type MapQuery,
  type PropertyType,
  type Source,
} from "~/lib/listings/types";
import { settledError } from "./http";
import { fetchNaverDetail, fetchNaverListings } from "./naver";
import { fetchZigbangDetail, fetchZigbangListings } from "./zigbang";

const MAX_MARKERS = 400;

export type ListingAdapters = {
  zigbang: typeof fetchZigbangListings;
  naver: typeof fetchNaverListings;
};

const defaultAdapters: ListingAdapters = {
  zigbang: fetchZigbangListings,
  naver: fetchNaverListings,
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

  const sources = query.sources.length > 0 ? query.sources : (["zigbang", "naver"] as Source[]);
  const propertyTypes =
    query.propertyTypes.length > 0
      ? query.propertyTypes
      : (["oneroom", "villa", "officetel", "apartment"] as PropertyType[]);

  const jobs: Promise<MapListing[]>[] = [];
  const jobSources: Source[] = [];

  if (sources.includes("zigbang")) {
    jobSources.push("zigbang");
    jobs.push(
      adapters.zigbang({
        bounds: query.bounds,
        zoom: query.zoom,
        propertyTypes,
      }),
    );
  }
  if (sources.includes("naver")) {
    jobSources.push("naver");
    jobs.push(
      adapters.naver({
        bounds: query.bounds,
        zoom: query.zoom,
        propertyTypes,
      }),
    );
  }

  const results = await Promise.allSettled(jobs);
  const listings: MapListing[] = [];
  const errors = [];

  results.forEach((result, index) => {
    const source = jobSources[index]!;
    if (result.status === "fulfilled") {
      listings.push(...result.value);
    } else {
      const message = settledError(result) ?? `${source} failed`;
      errors.push({ source, message });
    }
  });

  const unique = dedupeListings(listings);
  const zigbang = unique.filter((item) => item.source === "zigbang").length;
  const naver = unique.filter((item) => item.source === "naver").length;
  const cluster = shouldCluster(query.zoom, unique.length, MAX_MARKERS);

  if (cluster) {
    const clusters = clusterListings(unique, cellSizeForZoom(query.zoom));
    return {
      mode: "clusters",
      clusters,
      listings: [],
      stats: {
        zigbang,
        naver,
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
  return fetchNaverDetail(input.sourceId);
}
