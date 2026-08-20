"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { isValidBounds } from "~/lib/geo/bounds";
import { type CircleFilter, type LatLng, formatRadius } from "~/lib/geo/shape";
import {
  areaBuckets,
  isAllAreaBuckets,
  type AreaBucketId,
} from "~/lib/listings/area";
import {
  friendlySourceError,
  propertyTypeLabel,
  salesTypeFilterLabel,
  sourceLabel,
} from "~/lib/listings/copy";
import {
  isAllPropertyTypes,
  needsHydratedFilters,
} from "~/lib/listings/filter";
import { mergeMapData } from "~/lib/listings/merge";
import { describeActiveFilters, filterKeyOf, mapLayersForFilters } from "~/lib/listings/visible";
import { loadPrefs, savePrefs, type ListSort, type ViewMode } from "~/lib/listings/prefs";
import { type PriceFilter } from "~/lib/listings/price";
import {
  isStationQuery,
  looksLikePlaceQuery,
  parseSearchQuery,
  placeSearchToken,
  unrefinedPlaceLeftover,
} from "~/lib/listings/search";
import { listingCardMeta } from "~/lib/listings/english";
import { ageFilterLabel, ageFilters, type AgeFilter } from "~/lib/listings/age";
import { floorFilterLabel, floorFilters, type FloorFilter } from "~/lib/listings/floor";
import { type SearchSnapshot } from "~/lib/listings/ai-search";
import { rankListings, type PhotoScoreInput } from "~/lib/listings/recommend";
import {
  isSavedHome,
  loadSavedHomes,
  saveSavedHomes,
  toggleSavedHome,
} from "~/lib/listings/saved";
import {
  buildAppSearch,
  hasAppUrlState,
  parseAppUrl,
} from "~/lib/listings/url-state";
import {
  type Bounds,
  type MapCluster,
  type MapData,
  type MapListing,
  type PropertyType,
  type SalesType,
  type Source,
} from "~/lib/listings/types";
import { ListingList } from "./ListingList";
import { ListingMap } from "./ListingMap";
import { ListingPanel } from "./ListingPanel";
import { ListingPhoto } from "./ListingPhoto";
import { AskSearch } from "./AskSearch";
import { ListingAgeDot } from "./ListingAgeDot";
import { ListingPrice } from "./ListingPrice";
import { PriceFilters } from "./PriceFilters";
import { useHistoryOverlay } from "./useHistoryOverlay";
import { usePhotoQuality } from "./usePhotoQuality";

const ALL_SOURCES: Source[] = ["zigbang", "naver", "peterpan"];
const ALL_TYPES: PropertyType[] = ["oneroom", "villa", "officetel", "apartment"];
const ALL_SALES: SalesType[] = ["jeonse", "wolse", "sale"];
const DEFAULT_SOURCES: Source[] = ["zigbang", "peterpan"];
const DEFAULT_SALES: SalesType[] = ["jeonse", "wolse"];
const DEFAULT_RADIUS_M = 1200;
const NAVER_HIDE_KEY = "ziggybang:hide-naver-error";
const TYPE_CHIP_ON: Record<PropertyType, string> = {
  oneroom: "bg-orange-500 text-slate-950",
  villa: "bg-amber-300 text-slate-950",
  officetel: "bg-violet-500 text-white",
  apartment: "bg-sky-400 text-slate-950",
};

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
  const [sources, setSources] = useState<Source[]>(DEFAULT_SOURCES);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>(ALL_TYPES);
  const [salesTypes, setSalesTypes] = useState<SalesType[]>(DEFAULT_SALES);
  const [areaBucketIds, setAreaBucketIds] = useState<AreaBucketId[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [listSort, setListSort] = useState<ListSort>("featured");
  const [listingLimit, setListingLimit] = useState(60);
  const [minDeposit, setMinDeposit] = useState<number | undefined>();
  const [maxDeposit, setMaxDeposit] = useState<number | undefined>();
  const [minRent, setMinRent] = useState<number | undefined>();
  const [maxRent, setMaxRent] = useState<number | undefined>();
  const [foreignerOk, setForeignerOk] = useState(false);
  const [floorFilter, setFloorFilter] = useState<FloorFilter | undefined>();
  const [ageFilter, setAgeFilter] = useState<AgeFilter | undefined>();
  const [askOpen, setAskOpen] = useState(false);
  const [savedHomes, setSavedHomes] = useState<MapListing[]>([]);
  const [tool, setTool] = useState<"pan" | "radius" | "draw">("pan");
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [manualCircle, setManualCircle] = useState<CircleFilter | null>(null);
  const [polygon, setPolygon] = useState<LatLng[] | null>(null);
  const [draftPoints, setDraftPoints] = useState<LatLng[]>([]);
  const [selected, setSelected] = useState<MapListing | null>(null);
  useHistoryOverlay({ selected, setSelected });
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    token: number;
  } | null>(null);
  const [dismissedNaver, setDismissedNaver] = useState(false);
  const [uiCompact, setUiCompact] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [urlView, setUrlView] = useState({
    lat: 37.565,
    lng: 126.98,
    zoom: 13,
  });
  const lastViewportKey = useRef<string | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlaceId = useRef<string | null>(null);
  const inspectedPhotos = useRef<string>("");
  const filterKeyRef = useRef<string>("");
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [visionById, setVisionById] = useState<Record<string, PhotoScoreInput>>({});

  const parsedSearch = useMemo(
    () => parseSearchQuery(debouncedQuery),
    [debouncedQuery],
  );
  useEffect(() => {
    if (parsedSearch.floorFilter) setFloorFilter(parsedSearch.floorFilter);
  }, [parsedSearch.floorFilter]);
  useEffect(() => {
    if (parsedSearch.ageFilter) setAgeFilter(parsedSearch.ageFilter);
  }, [parsedSearch.ageFilter]);
  const geoToken =
    !parsedSearch.place && looksLikePlaceQuery(debouncedQuery)
      ? (placeSearchToken(debouncedQuery) ?? debouncedQuery)
      : parsedSearch.place && unrefinedPlaceLeftover(debouncedQuery, parsedSearch.place)
        ? debouncedQuery
        : undefined;
  const geocodeQuery = api.listings.geocode.useQuery(
    { query: geoToken ?? "" },
    {
      enabled: Boolean(geoToken),
      staleTime: 60 * 60 * 1000,
      retry: false,
    },
  );
  const place =
    (geoToken ? geocodeQuery.data : undefined) ??
    parsedSearch.place ??
    geocodeQuery.data ??
    undefined;
  const listingQuery = parsedSearch.listingQuery;

  const circle = useMemo<CircleFilter | null>(() => {
    if (polygon) return null;
    if (manualCircle) return { ...manualCircle, radiusM };
    if (!place) return null;
    const stationWalk = isStationQuery(debouncedQuery) ? (place.radiusM ?? 800) : radiusM;
    return {
      lat: place.lat,
      lng: place.lng,
      radiusM: stationWalk,
    };
  }, [debouncedQuery, manualCircle, place, polygon, radiusM]);

  useEffect(() => {
    const saved = loadPrefs();
    const url = typeof window !== "undefined" && hasAppUrlState(window.location.search)
      ? parseAppUrl(window.location.search)
      : {};
    const base = saved;
    setSources(url.sources ?? base?.sources ?? DEFAULT_SOURCES);
    setPropertyTypes(url.propertyTypes ?? base?.propertyTypes ?? ALL_TYPES);
    setSalesTypes(url.salesTypes ?? base?.salesTypes ?? DEFAULT_SALES);
    setAreaBucketIds(url.areaBucketIds ?? base?.areaBucketIds ?? []);
    setSearchInput(url.searchInput ?? base?.searchInput ?? "");
    setDebouncedQuery(url.searchInput ?? base?.searchInput ?? "");
    setViewMode(url.viewMode ?? base?.viewMode ?? "map");
    setListSort(url.listSort ?? base?.listSort ?? "featured");
    setMinDeposit(url.minDeposit ?? base?.minDeposit);
    setMaxDeposit(url.maxDeposit ?? base?.maxDeposit);
    setMinRent(url.minRent ?? base?.minRent);
    setMaxRent(url.maxRent ?? base?.maxRent);
    setForeignerOk(url.foreignerOk ?? base?.foreignerOk ?? false);
    setFloorFilter(url.floorFilter ?? base?.floorFilter);
    setAgeFilter(url.ageFilter ?? base?.ageFilter);
    setRadiusM(url.radiusM ?? base?.radiusM ?? DEFAULT_RADIUS_M);
    setManualCircle(base?.circle ?? null);
    setPolygon(base?.polygon ?? null);
    if (typeof base?.uiCompact === "boolean") {
      setUiCompact(base.uiCompact);
    } else {
      setUiCompact(window.innerWidth < 768);
    }
    try {
      setDismissedNaver(window.localStorage.getItem(NAVER_HIDE_KEY) === "1");
    } catch {
      /* private mode */
    }
    const view = url.view ?? base?.view;
    const searchText = url.searchInput ?? base?.searchInput ?? "";
    if (view) {
      setUrlView({
        lat: view.lat,
        lng: view.lng,
        zoom: Math.round(view.zoom),
      });
    }
    if (view && !parseSearchQuery(searchText).place) {
      setZoom(Math.round(view.zoom));
      setFocus({
        lat: view.lat,
        lng: view.lng,
        zoom: view.zoom,
        token: Date.now(),
      });
    }
    setSavedHomes(loadSavedHomes());
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
      listSort,
      minDeposit,
      maxDeposit,
      minRent,
      maxRent,
      foreignerOk,
      floorFilter,
      ageFilter,
    });
  }, [
    areaBucketIds,
    bounds,
    maxDeposit,
    maxRent,
    minDeposit,
    minRent,
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
    listSort,
    foreignerOk,
    floorFilter,
    ageFilter,
  ]);

  useEffect(() => {
    if (!prefsLoaded || typeof window === "undefined") return;
    const next = buildAppSearch({
      searchInput,
      viewMode,
      sources,
      propertyTypes,
      salesTypes,
      areaBucketIds,
      radiusM,
      view: urlView,
      listSort,
      minDeposit,
      maxDeposit,
      minRent,
      maxRent,
      foreignerOk,
      floorFilter,
      ageFilter,
    });
    const url = `${window.location.pathname}${next}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [
    areaBucketIds,
    listSort,
    maxDeposit,
    maxRent,
    minDeposit,
    minRent,
    prefsLoaded,
    propertyTypes,
    radiusM,
    salesTypes,
    searchInput,
    sources,
    urlView,
    viewMode,
    foreignerOk,
    floorFilter,
    ageFilter,
  ]);

  useEffect(() => {
    if (!prefsLoaded) return;
    const timer = setTimeout(() => {
      setUrlView({
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2,
        zoom,
      });
    }, 1400);
    return () => clearTimeout(timer);
  }, [bounds, prefsLoaded, zoom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (askOpen) {
        setAskOpen(false);
        return;
      }
      if (selected) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen, selected]);

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
    if (isStationQuery(debouncedQuery) || place.radiusM) {
      setRadiusM(place.radiusM ?? 800);
    }
  }, [debouncedQuery, place]);

  const filtersNeedHomes =
    !isAllPropertyTypes(propertyTypes.length ? propertyTypes : ALL_TYPES) ||
    needsHydratedFilters({
      salesTypes,
      areaBucketIds,
      query: listingQuery,
      minDeposit,
      maxDeposit,
      minRent,
      maxRent,
      foreignerOk,
      floorFilter,
      ageFilter,
    });
  const currentFilterKey = filterKeyOf({
    sources,
    propertyTypes,
    salesTypes,
    areaBucketIds,
    query: listingQuery,
    minDeposit,
    maxDeposit,
    minRent,
    maxRent,
    foreignerOk,
    floorFilter,
    ageFilter,
  });
  const keepViewportPlaceholder = filterKeyRef.current === currentFilterKey;
  filterKeyRef.current = currentFilterKey;

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
      includeListings:
        viewMode === "list" ||
        viewMode === "best" ||
        Boolean(circle ?? polygon) ||
        filtersNeedHomes,
      listingLimit:
        viewMode === "list" || viewMode === "best"
          ? listingLimit
          : filtersNeedHomes
            ? 240
            : undefined,
      minDeposit,
      maxDeposit,
      minRent,
      maxRent,
      foreignerOk: foreignerOk || undefined,
      floorFilter,
      ageFilter,
    }),
    [
      areaBucketIds,
      bounds,
      circle,
      filtersNeedHomes,
      floorFilter,
      ageFilter,
      foreignerOk,
      listingLimit,
      listingQuery,
      maxDeposit,
      maxRent,
      minDeposit,
      minRent,
      polygon,
      propertyTypes,
      salesTypes,
      viewMode,
      zoom,
    ],
  );

  const mapQueryOptions = {
    placeholderData: keepViewportPlaceholder
      ? (previous: MapData | undefined) => previous
      : undefined,
    refetchOnWindowFocus: false as const,
    retry: false as const,
  };

  const zigbangQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["zigbang"] },
    {
      enabled: prefsLoaded && sources.includes("zigbang"),
      ...mapQueryOptions,
    },
  );
  const naverQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["naver"] },
    {
      enabled: prefsLoaded && sources.includes("naver"),
      ...mapQueryOptions,
    },
  );

  const peterpanQuery = api.listings.getMap.useQuery(
    { ...sharedInput, sources: ["peterpan"] },
    {
      enabled: prefsLoaded && sources.includes("peterpan"),
      ...mapQueryOptions,
    },
  );
  const recommendAi = api.listings.aiStatus.useQuery(undefined, {
    staleTime: 60_000,
    enabled: viewMode === "best",
  });
  const inspectPhotos = api.listings.inspectPhotos.useMutation();

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
    const layers = mapLayersForFilters(data.listings, data.clusters, {
      propertyTypes: propertyTypes.length ? propertyTypes : ALL_TYPES,
      salesTypes: salesTypes.length ? salesTypes : ALL_SALES,
      areaBucketIds,
      query: listingQuery,
      circle: circle ?? undefined,
      polygon,
      zoom,
      minDeposit,
      maxDeposit,
      minRent,
      maxRent,
      foreignerOk,
      floorFilter,
      ageFilter,
    });
    return {
      clusters: layers.clusters,
      listings: layers.listings,
      stats: data.stats,
      errors: data.errors,
    };
  }, [
    areaBucketIds,
    circle,
    data,
    floorFilter,
    ageFilter,
    listingQuery,
    maxDeposit,
    maxRent,
    minDeposit,
    minRent,
    polygon,
    propertyTypes,
    salesTypes,
    zoom,
    foreignerOk,
  ]);

  const waitingForFirst =
    (sources.includes("zigbang") && zigbangQuery.isLoading) ||
    (sources.includes("peterpan") && peterpanQuery.isLoading && !zigbangQuery.data) ||
    (sources.includes("naver") && naverQuery.isLoading && !zigbangQuery.data);
  const refreshing = zigbangQuery.isFetching && !zigbangQuery.isLoading;

  useEffect(() => {
    if (!selected || viewMode === "saved") return;
    if (visible.listings.some((item) => item.id === selected.id)) return;
    if (waitingForFirst) return;
    if (
      refreshing &&
      visible.listings.length === 0 &&
      visible.clusters.length === 0
    ) {
      return;
    }
    setSelected(null);
  }, [
    refreshing,
    selected,
    viewMode,
    visible.clusters.length,
    visible.listings,
    waitingForFirst,
  ]);

  const onViewport = useCallback((next: Bounds & { zoom: number }) => {
    if (!isValidBounds(next)) return;
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
      if (tool === "pan") {
        setSelected(null);
        return;
      }
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

  const clearChipFilters = () => {
    setPropertyTypes(ALL_TYPES);
    setSalesTypes(DEFAULT_SALES);
    setAreaBucketIds([]);
    setMinDeposit(undefined);
    setMaxDeposit(undefined);
    setMinRent(undefined);
    setMaxRent(undefined);
    setForeignerOk(false);
    setFloorFilter(undefined);
    setAgeFilter(undefined);
  };

  useEffect(() => {
    setListingLimit(viewMode === "best" ? 120 : 60);
  }, [bounds, debouncedQuery, viewMode, minDeposit, maxDeposit, minRent, maxRent, foreignerOk, floorFilter, ageFilter]);

  const onToggleSave = useCallback((listing: MapListing) => {
    setSavedHomes((currentHomes) => {
      const next = toggleSavedHome(currentHomes, listing);
      saveSavedHomes(next);
      return next;
    });
  }, []);

  const copySearchLink = useCallback(async () => {
    const next = buildAppSearch({
      searchInput,
      viewMode,
      sources,
      propertyTypes,
      salesTypes,
      areaBucketIds,
      radiusM,
      view: {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2,
        zoom,
      },
      listSort,
      minDeposit,
      maxDeposit,
      minRent,
      maxRent,
      foreignerOk,
      floorFilter,
      ageFilter,
    });
    const href = `${window.location.origin}${window.location.pathname}${next}`;
    try {
      await navigator.clipboard.writeText(href);
      setShareHint("Copied");
    } catch {
      window.prompt("Copy this search link", href);
    }
    window.setTimeout(() => setShareHint(null), 1600);
  }, [
    areaBucketIds,
    bounds,
    floorFilter,
    ageFilter,
    listSort,
    maxDeposit,
    maxRent,
    minDeposit,
    minRent,
    propertyTypes,
    radiusM,
    salesTypes,
    searchInput,
    sources,
    viewMode,
    zoom,
    foreignerOk,
  ]);

  const hideNaverError = useCallback((turnOff = false) => {
    setDismissedNaver(true);
    if (turnOff) {
      setSources((current) => {
        const next = current.filter((source) => source !== "naver");
        return next.length ? next : current;
      });
    }
    try {
      window.localStorage.setItem(NAVER_HIDE_KEY, "1");
    } catch {
      /* private mode */
    }
  }, []);

  const applySearchSnapshot = useCallback((snapshot: SearchSnapshot) => {
    setSearchInput(snapshot.searchInput);
    setDebouncedQuery(snapshot.searchInput);
    setPropertyTypes(snapshot.propertyTypes.length ? snapshot.propertyTypes : ALL_TYPES);
    setSalesTypes(snapshot.salesTypes.length ? snapshot.salesTypes : ALL_SALES);
    setAreaBucketIds(snapshot.areaBucketIds);
    setMinDeposit(snapshot.minDeposit);
    setMaxDeposit(snapshot.maxDeposit);
    setMinRent(snapshot.minRent);
    setMaxRent(snapshot.maxRent);
    setForeignerOk(Boolean(snapshot.foreignerOk));
    setFloorFilter(snapshot.floorFilter);
    setAgeFilter(snapshot.ageFilter);
    setRadiusM(snapshot.radiusM);
    setViewMode(snapshot.viewMode);
  }, []);

  const searchSnapshot = useMemo<SearchSnapshot>(
    () => ({
      searchInput,
      propertyTypes,
      salesTypes,
      areaBucketIds,
      radiusM,
      viewMode,
      minDeposit,
      maxDeposit,
      minRent,
      maxRent,
      foreignerOk,
      floorFilter,
      ageFilter,
    }),
    [
      areaBucketIds,
      floorFilter,
      ageFilter,
      maxDeposit,
      maxRent,
      minDeposit,
      minRent,
      propertyTypes,
      radiusM,
      salesTypes,
      searchInput,
      viewMode,
      foreignerOk,
    ],
  );

  const priceFilter = useMemo<PriceFilter>(
    () => ({ minDeposit, maxDeposit, minRent, maxRent }),
    [maxDeposit, maxRent, minDeposit, minRent],
  );
  const filterSummary = describeActiveFilters({
    propertyTypes,
    salesTypes,
    areaBucketIds,
    minDeposit,
    maxDeposit,
    minRent,
    maxRent,
    foreignerOk,
    floorFilter,
    ageFilter,
  });
  const visibleHomeCount = visible.clusters.length
    ? visible.clusters.reduce((sum, cluster) => sum + cluster.count, 0)
    : visible.listings.length;

  const showList = viewMode === "list" || viewMode === "saved" || viewMode === "best";
  const listListings = viewMode === "saved" ? savedHomes : visible.listings;
  const photoScores = usePhotoQuality(
    viewMode === "best" ? listListings.map((item) => item.thumbnail) : [],
    viewMode === "best",
  );
  const photoInputs = useMemo(() => {
    const next: Record<string, PhotoScoreInput> = {};
    for (const listing of listListings) {
      const url = listing.thumbnail;
      if (!url) continue;
      const local = photoScores[url];
      const vision = visionById[listing.id];
      if (vision && local) {
        next[url] = {
          score: Math.round(local.score * 0.4 + vision.score * 0.6),
          summary: vision.summary ?? local.summary,
          likelyFloorplan: local.likelyFloorplan,
          likelyDim: local.likelyDim,
        };
      } else if (vision) {
        next[url] = vision;
      } else if (local) {
        next[url] = local;
      }
    }
    return next;
  }, [listListings, photoScores, visionById]);
  const ranked = useMemo(
    () => (viewMode === "best" ? rankListings(listListings, photoInputs) : undefined),
    [listListings, photoInputs, viewMode],
  );
  const listingIdsKey = listListings.map((item) => item.id).join(",");

  useEffect(() => {
    if (viewMode !== "best" || !recommendAi.data?.openai || !listingIdsKey) return;
    const top = rankListings(listListings, photoScores)
      .slice(0, 6)
      .flatMap((item) => {
        const raw = item.listing.thumbnail;
        if (!raw) return [];
        const url = raw.startsWith("//") ? `https:${raw}` : raw;
        if (!/^https?:\/\//.test(url)) return [];
        return [{ id: item.listing.id, url }];
      });
    const key = top.map((item) => item.id).join(",");
    if (!key || inspectedPhotos.current === key) return;
    inspectedPhotos.current = key;
    void inspectPhotos
      .mutateAsync({ items: top })
      .then((rows) => {
        setVisionById(
          Object.fromEntries(
            rows.map((row) => [
              row.id,
              {
                score: row.score,
                summary: row.summary,
                likelyFloorplan: false,
                likelyDim: false,
              },
            ]),
          ),
        );
      })
      .catch(() => undefined);
  }, [inspectPhotos, listListings, listingIdsKey, photoScores, recommendAi.data?.openai, viewMode]);

  const naverError = dismissedNaver
    ? undefined
    : visible.errors.find((error) => error.source === "naver");

  const statusLabel = waitingForFirst
    ? "Loading…"
    : [
        sources.includes("zigbang")
          ? `Zigbang ${visible.stats.zigbang.toLocaleString("en-US")}`
          : null,
        sources.includes("naver")
          ? `Naver ${visible.stats.naver.toLocaleString("en-US")}`
          : null,
        sources.includes("peterpan")
          ? `Peterpan ${visible.stats.peterpan.toLocaleString("en-US")}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const areaHint = place
    ? `${place.names[1] ?? place.names[0]} · ${formatRadius(circle?.radiusM ?? radiusM)}`
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
                onClick={() => setAskOpen(true)}
                className="rounded-full bg-sky-400 px-2.5 py-1 text-[11px] font-medium text-slate-950 hover:bg-sky-300"
              >
                Ask
              </button>
              <button
                type="button"
                onClick={() => void copySearchLink()}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
              >
                {shareHint ?? "Copy link"}
              </button>
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
                    ? TYPE_CHIP_ON[type]
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
            <button
              type="button"
              onClick={() => setForeignerOk((current) => !current)}
              title="Only ads that mention foreigners are welcome. Most landlords never write it."
              className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                foreignerOk
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              Foreigners welcome
            </button>
            {floorFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() =>
                  setFloorFilter((current) => (current === filter ? undefined : filter))
                }
                className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                  floorFilter === filter
                    ? "bg-amber-300 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {floorFilterLabel[filter]}
              </button>
            ))}
            {ageFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                title={
                  filter === "week"
                    ? "Listed in the last 7 days"
                    : "Listed in the last 30 days"
                }
                onClick={() =>
                  setAgeFilter((current) => (current === filter ? undefined : filter))
                }
                className={`rounded-full px-2.5 py-1 text-xs sm:text-sm ${
                  ageFilter === filter
                    ? filter === "week"
                      ? "bg-emerald-400 text-slate-950"
                      : "bg-amber-300 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {ageFilterLabel[filter]}
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
              placeholder="Search Hongdae, Dangsan station, studio…"
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
          {uiCompact && filterSummary ? (
            <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-violet-200">
              <span className="min-w-0 truncate">
                {filterSummary}
                {visibleHomeCount
                  ? ` · ${visibleHomeCount.toLocaleString("en-US")} on map`
                  : ""}
              </span>
              <button
                type="button"
                onClick={clearChipFilters}
                className="shrink-0 text-slate-400 hover:text-white"
              >
                Clear filters
              </button>
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["map", "list", "best", "saved"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-full px-2.5 py-1 text-xs capitalize sm:text-sm ${
                  viewMode === mode ? "bg-white text-slate-950" : "bg-white/10 text-slate-300"
                }`}
              >
                {mode === "saved"
                  ? `Saved${savedHomes.length ? ` ${savedHomes.length}` : ""}`
                  : mode}
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

          <PriceFilters
            value={priceFilter}
            onChange={(next) => {
              setMinDeposit(next.minDeposit);
              setMaxDeposit(next.maxDeposit);
              setMinRent(next.minRent);
              setMaxRent(next.maxRent);
            }}
          />
          {filterSummary ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] text-violet-200">
                {filterSummary}
                {visibleHomeCount
                  ? ` · ${visibleHomeCount.toLocaleString("en-US")} on map`
                  : ""}
              </p>
              <button
                type="button"
                onClick={clearChipFilters}
                className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
              >
                Clear filters
              </button>
            </div>
          ) : null}

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
          </>
          ) : null}

          {naverError ? (
            <p className="mt-1.5 flex items-start justify-between gap-2 text-[11px] text-amber-300">
              <span>{friendlySourceError(naverError.source, naverError.message)}</span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="text-slate-400 hover:text-white"
                  onClick={() => hideNaverError(true)}
                >
                  Turn off
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white"
                  onClick={() => hideNaverError(false)}
                >
                  Dismiss
                </button>
              </span>
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          data-map-chrome={
            viewMode === "map" && visible.listings.length ? "carousel" : undefined
          }
          className={
            showList
              ? "pointer-events-none invisible absolute inset-0 z-0 h-full md:visible md:pointer-events-auto md:static md:z-auto md:w-[46%]"
              : "h-full min-h-0 min-w-0 flex-1"
          }
        >
          <ListingMap
            clusters={visible.clusters}
            listings={visible.clusters.length ? [] : visible.listings}
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
        {showList ? (
          <div
            data-list-panel="portrait"
            className="relative z-[1200] h-full min-h-0 w-full min-w-0 flex-1 bg-slate-950"
          >
            <ListingList
              listings={listListings}
              selectedId={selected?.id}
              loading={viewMode === "saved" ? false : waitingForFirst && listListings.length === 0}
              truncated={viewMode === "saved" ? false : visible.stats.truncated}
              totalCount={
                viewMode === "saved"
                  ? savedHomes.length
                  : visible.stats.zigbang + visible.stats.naver + visible.stats.peterpan
              }
              sort={listSort}
              savedIds={savedHomes.map((item) => item.id)}
              canLoadMore={
                (viewMode === "list" || viewMode === "best") &&
                visible.stats.truncated &&
                listingLimit < 300
              }
              ranked={ranked}
              recommendHint={
                viewMode !== "best"
                  ? undefined
                  : zoom < 14 && !circle && !polygon
                    ? "Search a neighborhood or zoom in. Best ranks homes by ₩/m², popular areas, and photo quality."
                    : recommendAi.data?.openai
                      ? "Ranked by neighborhood, ₩/m², and listing photos. OpenAI is double-checking the top interiors."
                      : "Ranked by neighborhood, ₩/m², and listing photos scored on this device."
              }
              emptyHint={
                viewMode === "saved"
                  ? "No saved homes yet. Tap the heart on a listing to keep it here."
                  : viewMode === "best" && zoom < 14 && !circle && !polygon
                    ? "Search Hongdae, Dangsan station, or zoom in so Best has homes to rank."
                    : foreignerOk
                      ? "Few ads say foreigners are welcome in the title. Widen the area, or turn that chip off."
                      : undefined
              }
              onSort={setListSort}
              onSelect={setSelected}
              onToggleSave={onToggleSave}
              loadingMore={
                (viewMode === "list" || viewMode === "best") &&
                refreshing &&
                visible.stats.truncated
              }
              onLoadMore={() => setListingLimit((current) => Math.min(300, current + 60))}
            />
          </div>
        ) : null}

        {selected ? (
          <ListingPanel
            listing={selected}
            saved={isSavedHome(savedHomes, selected.id)}
            onClose={() => setSelected(null)}
            onToggleSave={onToggleSave}
          />
        ) : viewMode === "map" && visible.listings.length ? (
          <div className="pointer-events-auto absolute bottom-4 left-4 right-16 z-[1100] flex gap-2 overflow-x-auto pb-1 no-scrollbar md:right-20">
            {visible.listings.slice(0, 24).map((listing) => {
              const meta = listingCardMeta(listing);
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
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                      <ListingAgeDot updatedAt={listing.updatedAt} />
                      {propertyTypeLabel[listing.propertyType]}
                      {listing.salesType
                        ? ` · ${salesTypeFilterLabel[listing.salesType]}`
                        : ""}
                    </span>
                    <ListingPrice
                      listing={listing}
                      className="mt-1 text-sm font-medium leading-snug"
                    />
                    {meta ? (
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                        {meta}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <AskSearch
        open={askOpen}
        current={searchSnapshot}
        onClose={() => setAskOpen(false)}
        onApply={applySearchSnapshot}
      />
    </div>
  );
}
