"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import {
  areaBuckets,
  isAllAreaBuckets,
  type AreaBucketId,
} from "~/lib/listings/area";
import {
  formatPrice,
  friendlySourceError,
  propertyTypeLabel,
  salesTypeFilterLabel,
  sourceLabel,
} from "~/lib/listings/copy";
import { needsListingDetails } from "~/lib/listings/filter";
import { mergeMapData } from "~/lib/listings/merge";
import { parseSearchQuery } from "~/lib/listings/search";
import {
  type Bounds,
  type MapCluster,
  type MapListing,
  type PropertyType,
  type SalesType,
  type Source,
} from "~/lib/listings/types";
import { ListingMap } from "./ListingMap";
import { ListingPanel } from "./ListingPanel";

const ALL_SOURCES: Source[] = ["zigbang", "naver"];
const ALL_TYPES: PropertyType[] = ["oneroom", "villa", "officetel", "apartment"];
const ALL_SALES: SalesType[] = ["jeonse", "wolse", "sale"];

function roundCoord(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function viewportKey(next: Bounds & { zoom: number }) {
  return [
    Math.round(next.zoom),
    roundCoord(next.south),
    roundCoord(next.west),
    roundCoord(next.north),
    roundCoord(next.east),
  ].join(":");
}

function toggleValue<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export default function MapApp() {
  const [bounds, setBounds] = useState<Bounds>({
    south: 37.53,
    west: 126.94,
    north: 37.6,
    east: 127.02,
  });
  const [zoom, setZoom] = useState(13);
  const [sources, setSources] = useState<Source[]>(ALL_SOURCES);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>(ALL_TYPES);
  const [salesTypes, setSalesTypes] = useState<SalesType[]>(ALL_SALES);
  const [areaBucketIds, setAreaBucketIds] = useState<AreaBucketId[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<MapListing | null>(null);
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    token: number;
  } | null>(null);
  const [dismissedNaver, setDismissedNaver] = useState(false);
  const lastViewportKey = useRef<string | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlaceId = useRef<string | null>(null);

  const parsedSearch = useMemo(
    () => parseSearchQuery(debouncedQuery),
    [debouncedQuery],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 320);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const place = parsedSearch.place;
    if (!place) {
      lastPlaceId.current = null;
      return;
    }
    if (lastPlaceId.current === place.id) return;
    lastPlaceId.current = place.id;
    setFocus({ lat: place.lat, lng: place.lng, zoom: place.zoom, token: Date.now() });
  }, [parsedSearch.place]);

  const sharedInput = useMemo(
    () => ({
      bounds,
      zoom,
      propertyTypes: propertyTypes.length ? propertyTypes : ALL_TYPES,
      salesTypes: salesTypes.length ? salesTypes : ALL_SALES,
      query: parsedSearch.listingQuery || undefined,
      areaBucketIds: isAllAreaBuckets(areaBucketIds) ? undefined : areaBucketIds,
    }),
    [areaBucketIds, bounds, parsedSearch.listingQuery, propertyTypes, salesTypes, zoom],
  );

  const zigbangQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["zigbang"] },
    {
      enabled: sources.includes("zigbang"),
      placeholderData: (previous) => previous,
      refetchOnWindowFocus: false,
    },
  );
  const naverQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["naver"] },
    {
      enabled: sources.includes("naver"),
      placeholderData: (previous) => previous,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const data = useMemo(
    () =>
      mergeMapData([
        sources.includes("zigbang") ? zigbangQuery.data : undefined,
        sources.includes("naver") ? naverQuery.data : undefined,
      ]),
    [naverQuery.data, sources, zigbangQuery.data],
  );

  const waitingForFirst =
    (sources.includes("zigbang") && zigbangQuery.isLoading) ||
    (sources.includes("naver") &&
      naverQuery.isLoading &&
      !zigbangQuery.data);
  const refreshing = zigbangQuery.isFetching && !zigbangQuery.isLoading;

  const onViewport = useCallback((next: Bounds & { zoom: number }) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      const key = viewportKey(next);
      if (lastViewportKey.current === key) return;
      lastViewportKey.current = key;
      setBounds({
        south: roundCoord(next.south),
        west: roundCoord(next.west),
        north: roundCoord(next.north),
        east: roundCoord(next.east),
      });
      setZoom(Math.round(next.zoom));
    }, 280);
  }, []);

  const onSelectCluster = useCallback((cluster: MapCluster) => {
    setSelected(null);
    setFocus({ lat: cluster.lat, lng: cluster.lng, token: Date.now() });
  }, []);

  const naverError = dismissedNaver
    ? undefined
    : data.errors.find((error) => error.source === "naver");

  const statusLabel = waitingForFirst
    ? "Loading…"
    : `Zigbang ${data.stats.zigbang.toLocaleString("en-US")} · Naver ${data.stats.naver.toLocaleString("en-US")}`;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1100] p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto max-w-xl rounded-2xl border border-white/10 bg-slate-950/92 p-2.5 shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-sky-300">
                Ziggybang
                {refreshing && !waitingForFirst ? (
                  <span className="ml-2 tracking-normal text-slate-400">
                    Updating…
                  </span>
                ) : null}
              </p>
              <h1 className="truncate text-sm font-semibold sm:text-lg">
                Korea rentals, in English
              </h1>
            </div>
            <p className="max-w-[46%] shrink-0 pt-0.5 text-right text-[11px] leading-tight text-slate-400">
              {statusLabel}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALL_SOURCES.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() =>
                  setSources((current) => {
                    const next = toggleValue(current, source);
                    return next.length ? next : current;
                  })
                }
                className={`rounded-full px-2.5 py-1 text-xs font-medium sm:text-sm ${
                  sources.includes(source)
                    ? source === "naver"
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-orange-500 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {sourceLabel[source]}
              </button>
            ))}
            {ALL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setPropertyTypes((current) => {
                    const next = toggleValue(current, type);
                    return next.length ? next : current;
                  })
                }
                className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                  propertyTypes.includes(type)
                    ? "bg-white text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {propertyTypeLabel[type]}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ALL_SALES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setSalesTypes((current) => {
                    const next = toggleValue(current, type);
                    return next.length ? next : current;
                  })
                }
                className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                  salesTypes.includes(type)
                    ? "bg-sky-400 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {salesTypeFilterLabel[type]}
              </button>
            ))}
          </div>

          <label className="mt-2 block">
            <span className="sr-only">Search neighborhoods or listings</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search Hongdae, 연남동, studio…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-400"
            />
          </label>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {areaBuckets.map((bucket) => {
              const active = areaBucketIds.includes(bucket.id);
              return (
                <button
                  key={bucket.id}
                  type="button"
                  title={bucket.hint}
                  onClick={() =>
                    setAreaBucketIds((current) => toggleValue(current, bucket.id))
                  }
                  className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                    active ? "bg-violet-400 text-slate-950" : "bg-white/10 text-slate-300"
                  }`}
                >
                  {bucket.label}
                </button>
              );
            })}
          </div>

          <p className="mt-1.5 hidden text-xs text-slate-400 sm:block">
            Zigbang and Naver listings on one map, with KRW prices and jeonse vs
            monthly rent explained.
          </p>

          {zoom < 15 &&
          needsListingDetails({
            salesTypes,
            areaBucketIds,
            query: parsedSearch.listingQuery,
          }) ? (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Zoom in to apply size, jeonse/monthly, and listing search to
              individual homes.
            </p>
          ) : null}

          {naverError ? (
            <p className="mt-1.5 flex items-start justify-between gap-2 text-[11px] text-amber-300">
              <span>{friendlySourceError(naverError.source, naverError.message)}</span>
              <button
                type="button"
                className="shrink-0 text-slate-400 hover:text-white"
                onClick={() => setDismissedNaver(true)}
              >
                Dismiss
              </button>
            </p>
          ) : null}
        </div>
      </header>

      <ListingMap
        clusters={data.clusters}
        listings={data.listings}
        selectedId={selected?.id}
        focus={focus}
        onViewport={onViewport}
        onSelectListing={setSelected}
        onSelectCluster={onSelectCluster}
      />

      {selected ? (
        <ListingPanel listing={selected} onClose={() => setSelected(null)} />
      ) : data.listings.length ? (
        <div className="pointer-events-auto absolute bottom-4 left-4 right-16 z-[1100] flex gap-2 overflow-x-auto pb-1 no-scrollbar md:right-20">
          {data.listings.slice(0, 24).map((listing) => {
            const price = formatPrice(listing);
            return (
              <button
                key={listing.id}
                type="button"
                onClick={() => setSelected(listing)}
                className="min-w-[9.5rem] shrink-0 rounded-2xl border border-white/10 bg-slate-950/92 px-3 py-2 text-left shadow-xl backdrop-blur"
              >
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  {propertyTypeLabel[listing.propertyType]}
                  {listing.salesType
                    ? ` · ${salesTypeFilterLabel[listing.salesType]}`
                    : ""}
                </p>
                <p className="mt-1 truncate text-sm font-medium">
                  {price ?? listing.title ?? "Open listing"}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
