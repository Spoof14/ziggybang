"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import {
  type CircleFilter,
  type LatLng,
  formatRadius,
  listingInArea,
} from "~/lib/geo/shape";
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
import { loadPrefs, savePrefs, type ViewMode } from "~/lib/listings/prefs";
import {
  looksLikePlaceQuery,
  parseSearchQuery,
  placeSearchToken,
  stripPlaceFromQuery,
} from "~/lib/listings/search";
import {
  type Bounds,
  type MapCluster,
  type MapListing,
  type PropertyType,
  type SalesType,
  type Source,
} from "~/lib/listings/types";
import { ListingList } from "./ListingList";
import { ListingMap } from "./ListingMap";
import { ListingPanel } from "./ListingPanel";
import { ListingPhoto } from "./ListingPhoto";

const ALL_SOURCES: Source[] = ["zigbang", "naver", "peterpan"];
const ALL_TYPES: PropertyType[] = ["oneroom", "villa", "officetel", "apartment"];
const ALL_SALES: SalesType[] = ["jeonse", "wolse", "sale"];
const DEFAULT_RADIUS_M = 1200;

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

function boundsCenter(bounds: Bounds): LatLng {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
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
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [tool, setTool] = useState<"pan" | "radius" | "draw">("pan");
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [manualCircle, setManualCircle] = useState<CircleFilter | null>(null);
  const [polygon, setPolygon] = useState<LatLng[] | null>(null);
  const [draftPoints, setDraftPoints] = useState<LatLng[]>([]);
  const [selected, setSelected] = useState<MapListing | null>(null);
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    token: number;
  } | null>(null);
  const [dismissedNaver, setDismissedNaver] = useState(false);
  const [uiCompact, setUiCompact] = useState(false);
  const lastViewportKey = useRef<string | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlaceId = useRef<string | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const parsedSearch = useMemo(
    () => parseSearchQuery(debouncedQuery),
    [debouncedQuery],
  );
  const geoToken =
    !parsedSearch.place && looksLikePlaceQuery(debouncedQuery)
      ? (placeSearchToken(debouncedQuery) ?? debouncedQuery)
      : undefined;
  const geocodeQuery = api.listings.geocode.useQuery(
    { query: geoToken ?? "" },
    {
      enabled: Boolean(geoToken),
      staleTime: 60 * 60 * 1000,
      retry: false,
    },
  );
  const place = parsedSearch.place ?? geocodeQuery.data ?? undefined;
  const listingQuery = place
    ? stripPlaceFromQuery(debouncedQuery, place)
    : looksLikePlaceQuery(debouncedQuery)
      ? ""
      : parsedSearch.listingQuery;

  const circle = useMemo<CircleFilter | null>(() => {
    if (polygon) return null;
    if (manualCircle) return { ...manualCircle, radiusM };
    if (!place) return null;
    return {
      lat: place.lat,
      lng: place.lng,
      radiusM,
    };
  }, [manualCircle, place, polygon, radiusM]);

  useEffect(() => {
    const saved = loadPrefs();
    if (saved) {
      setSources(saved.sources);
      setPropertyTypes(saved.propertyTypes);
      setSalesTypes(saved.salesTypes);
      setAreaBucketIds(saved.areaBucketIds);
      setSearchInput(saved.searchInput);
      setDebouncedQuery(saved.searchInput);
      setViewMode(saved.viewMode);
      setRadiusM(saved.radiusM);
      setManualCircle(saved.circle);
      setPolygon(saved.polygon);
      setUiCompact(saved.uiCompact);
      if (saved.view && !parseSearchQuery(saved.searchInput).place) {
        setZoom(Math.round(saved.view.zoom));
        setFocus({
          lat: saved.view.lat,
          lng: saved.view.lng,
          zoom: saved.view.zoom,
          token: Date.now(),
        });
      }
    }
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    savePrefs({
      sources,
      propertyTypes,
      salesTypes,
      areaBucketIds,
      searchInput,
      viewMode,
      radiusM,
      circle: manualCircle,
      polygon,
      view: {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2,
        zoom,
      },
      uiCompact,
    });
  }, [
    areaBucketIds,
    bounds,
    manualCircle,
    polygon,
    prefsLoaded,
    propertyTypes,
    radiusM,
    salesTypes,
    searchInput,
    sources,
    uiCompact,
    viewMode,
    zoom,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!place) {
      lastPlaceId.current = null;
      return;
    }
    if (lastPlaceId.current === place.id) return;
    lastPlaceId.current = place.id;
    setPolygon(null);
    setDraftPoints([]);
    setManualCircle(null);
    setFocus({
      lat: place.lat,
      lng: place.lng,
      zoom: Math.max(place.zoom, 15),
      token: Date.now(),
    });
  }, [place]);

  const sharedInput = useMemo(
    () => ({
      bounds,
      zoom,
      propertyTypes: propertyTypes.length ? propertyTypes : ALL_TYPES,
      salesTypes: salesTypes.length ? salesTypes : ALL_SALES,
      query: listingQuery || undefined,
      areaBucketIds: isAllAreaBuckets(areaBucketIds) ? undefined : areaBucketIds,
      circle: circle ?? undefined,
      polygon: polygon && polygon.length >= 3 ? polygon : undefined,
      includeListings: viewMode === "list" || Boolean(circle ?? polygon),
    }),
    [
      areaBucketIds,
      bounds,
      circle,
      listingQuery,
      polygon,
      propertyTypes,
      salesTypes,
      viewMode,
      zoom,
    ],
  );

  const zigbangQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["zigbang"] },
    {
      enabled: prefsLoaded && sources.includes("zigbang"),
      placeholderData: (previous) => previous,
      refetchOnWindowFocus: false,
    },
  );
  const naverQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["naver"] },
    {
      enabled: prefsLoaded && sources.includes("naver"),
      placeholderData: (previous) => previous,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const peterpanQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["peterpan"] },
    {
      enabled: prefsLoaded && sources.includes("peterpan"),
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
        sources.includes("peterpan") ? peterpanQuery.data : undefined,
      ]),
    [naverQuery.data, peterpanQuery.data, sources, zigbangQuery.data],
  );

  const visible = useMemo(() => {
    const hasArea = Boolean(circle ?? (polygon && polygon.length >= 3));
    const listings = data.listings.filter((listing) =>
      listingInArea(listing, circle ?? undefined, polygon ?? undefined),
    );
    return {
      clusters: hasArea ? [] : data.clusters,
      listings,
      stats: data.stats,
      errors: data.errors,
    };
  }, [circle, data, polygon]);

  const waitingForFirst =
    (sources.includes("zigbang") && zigbangQuery.isLoading) ||
    (sources.includes("peterpan") && peterpanQuery.isLoading && !zigbangQuery.data) ||
    (sources.includes("naver") && naverQuery.isLoading && !zigbangQuery.data);
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

  const onMapClick = useCallback(
    (point: LatLng) => {
      if (tool === "radius") {
        setPolygon(null);
        setDraftPoints([]);
        setManualCircle({ ...point, radiusM });
        return;
      }
      if (tool === "draw") {
        setManualCircle(null);
        setDraftPoints((current) => [...current, point]);
      }
    },
    [radiusM, tool],
  );

  const finishDraw = useCallback(() => {
    if (draftPoints.length < 3) return;
    setPolygon(draftPoints);
    setDraftPoints([]);
    setTool("pan");
  }, [draftPoints]);

  const clearArea = () => {
    setPolygon(null);
    setDraftPoints([]);
    setManualCircle(null);
    if (place) {
      setSearchInput("");
      setDebouncedQuery("");
    }
  };

  const naverError = dismissedNaver
    ? undefined
    : visible.errors.find((error) => error.source === "naver");

  const statusLabel = waitingForFirst
    ? "Loading…"
    : `Zigbang ${visible.stats.zigbang.toLocaleString("en-US")} · Naver ${visible.stats.naver.toLocaleString("en-US")} · Peterpan ${visible.stats.peterpan.toLocaleString("en-US")}`;

  const areaHint = place
    ? `${place.names[1] ?? place.names[0]} · ${formatRadius(radiusM)}`
    : circle
      ? `Within ${formatRadius(radiusM)}`
      : polygon
        ? "Inside drawn area"
        : geocodeQuery.isFetching
          ? `Looking up ${debouncedQuery}…`
          : geoToken && geocodeQuery.isFetched && !geocodeQuery.data
            ? `No neighborhood named “${debouncedQuery}”. Try the Korean name, or drop a radius.`
            : null;

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="z-[1100] shrink-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-slate-950/92 p-2.5 shadow-xl backdrop-blur">
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
            <div className="flex shrink-0 items-start gap-2">
              <p className="max-w-[11rem] pt-0.5 text-right text-[11px] leading-tight text-slate-400 sm:max-w-[46%]">
                {statusLabel}
              </p>
              <button
                type="button"
                onClick={() => setUiCompact((current) => !current)}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
              >
                {uiCompact ? "Show filters" : "Hide filters"}
              </button>
            </div>
          </div>

          {!uiCompact ? (
          <>
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
                      : source === "peterpan"
                        ? "bg-amber-400 text-slate-950"
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
          </>
          ) : null}

          <label className="relative mt-2 block">
            <span className="sr-only">Search neighborhoods or listings</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setDebouncedQuery(searchInput);
              }}
              placeholder="Search Hongdae, 연남동, studio…"
              autoComplete="off"
              spellCheck={false}
              className="search-input w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 pr-16 text-sm text-slate-100 caret-white outline-none focus:border-sky-400"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setDebouncedQuery("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Clear
              </button>
            ) : null}
          </label>
          {areaHint ? (
            <p className="mt-1 text-[11px] text-sky-300">{areaHint}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["map", "list"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-full px-2.5 py-1 text-xs capitalize sm:text-sm ${
                  viewMode === mode ? "bg-white text-slate-950" : "bg-white/10 text-slate-300"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {!uiCompact ? (
          <>
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

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["pan", "radius", "draw"] as const).map((nextTool) => (
              <button
                key={nextTool}
                type="button"
                onClick={() => setTool(nextTool)}
                className={`rounded-full px-2.5 py-1 text-xs capitalize sm:text-sm ${
                  tool === nextTool ? "bg-sky-400 text-slate-950" : "bg-white/10 text-slate-300"
                }`}
              >
                {nextTool === "pan" ? "Move" : nextTool === "radius" ? "Radius" : "Draw"}
              </button>
            ))}
            {tool === "radius" ? (
              <button
                type="button"
                onClick={() => {
                  setPolygon(null);
                  setDraftPoints([]);
                  setManualCircle({ ...boundsCenter(bounds), radiusM });
                }}
                className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300 sm:text-sm"
              >
                Use map center
              </button>
            ) : null}
            {draftPoints.length ? (
              <button
                type="button"
                onClick={() => setDraftPoints((current) => current.slice(0, -1))}
                className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300 sm:text-sm"
              >
                Undo point
              </button>
            ) : null}
            {draftPoints.length >= 3 ? (
              <button
                type="button"
                onClick={finishDraw}
                className="rounded-full bg-emerald-400 px-2.5 py-1 text-xs text-slate-950 sm:text-sm"
              >
                Finish shape
              </button>
            ) : null}
            {Boolean(circle ?? polygon) || draftPoints.length > 0 ? (
              <button
                type="button"
                onClick={clearArea}
                className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300 sm:text-sm"
              >
                Clear area
              </button>
            ) : null}
          </div>

          {tool === "radius" || circle ? (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
              Radius
              <input
                type="range"
                min={250}
                max={3000}
                step={50}
                value={radiusM}
                onChange={(event) => setRadiusM(Number(event.target.value))}
                className="flex-1"
              />
              <span className="w-14 text-right text-white">{formatRadius(radiusM)}</span>
            </label>
          ) : null}

          {tool === "draw" ? (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Tap the map to add corners, then Finish shape. Double-tap also
              closes it.
            </p>
          ) : null}
          {tool === "radius" && !circle ? (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Tap the map to drop a search radius, or use map center.
            </p>
          ) : null}

          {zoom < 15 &&
          !circle &&
          !polygon &&
          needsListingDetails({
            salesTypes,
            areaBucketIds,
            query: listingQuery,
          }) ? (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Zoom in to apply size and listing-text filters to individual homes.
            </p>
          ) : null}
          </>
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

      <div className="relative min-h-0 flex-1">
        {viewMode === "list" ? (
          <div className="flex h-full min-h-0 flex-col md:flex-row">
            <div className="hidden min-h-0 md:block md:w-[46%]">
              <ListingMap
                clusters={visible.clusters}
                listings={visible.listings}
                selectedId={selected?.id}
                focus={focus}
                circle={circle}
                polygon={polygon}
                draftPoints={draftPoints}
                tool={tool}
                onViewport={onViewport}
                onSelectListing={setSelected}
                onSelectCluster={onSelectCluster}
                onMapClick={onMapClick}
                onFinishDraw={finishDraw}
              />
            </div>
            <div className="min-h-0 flex-1">
              <ListingList
                listings={visible.listings}
                selectedId={selected?.id}
                loading={waitingForFirst || refreshing}
                onSelect={setSelected}
              />
            </div>
          </div>
        ) : (
          <ListingMap
            clusters={visible.clusters}
            listings={visible.listings}
            selectedId={selected?.id}
            focus={focus}
            circle={circle}
            polygon={polygon}
            draftPoints={draftPoints}
            tool={tool}
            onViewport={onViewport}
            onSelectListing={setSelected}
            onSelectCluster={onSelectCluster}
            onMapClick={onMapClick}
            onFinishDraw={finishDraw}
          />
        )}

        {selected ? (
          <ListingPanel listing={selected} onClose={() => setSelected(null)} />
        ) : viewMode === "map" && visible.listings.length ? (
          <div className="pointer-events-auto absolute bottom-4 left-4 right-16 z-[1100] flex gap-2 overflow-x-auto pb-1 no-scrollbar md:right-20">
            {visible.listings.slice(0, 24).map((listing) => {
              const price = formatPrice(listing);
              return (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => setSelected(listing)}
                  className="min-w-[9.5rem] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/92 text-left shadow-xl backdrop-blur"
                >
                  <ListingPhoto
                    url={listing.thumbnail}
                    alt=""
                    width={240}
                    className="h-16 w-full object-cover"
                  />
                  <span className="block px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                      {propertyTypeLabel[listing.propertyType]}
                      {listing.salesType
                        ? ` · ${salesTypeFilterLabel[listing.salesType]}`
                        : ""}
                    </span>
                    <span className="mt-1 block truncate text-sm font-medium">
                      {price ?? listing.title ?? "Open listing"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
