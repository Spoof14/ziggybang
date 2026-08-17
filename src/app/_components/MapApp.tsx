"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { overlapRatio } from "~/lib/geo/bounds";
import {
  friendlySourceError,
  propertyTypeLabel,
  sourceLabel,
} from "~/lib/listings/copy";
import {
  type Bounds,
  type MapCluster,
  type MapListing,
  type PropertyType,
  type Source,
} from "~/lib/listings/types";
import { ListingMap } from "./ListingMap";
import { ListingPanel } from "./ListingPanel";

const ALL_SOURCES: Source[] = ["zigbang", "naver"];
const ALL_TYPES: PropertyType[] = ["oneroom", "villa", "officetel", "apartment"];

function toggleValue<T>(values: T[], value: T): T[] {
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
  const [selected, setSelected] = useState<MapListing | null>(null);
  const [focus, setFocus] = useState<{
    lat: number;
    lng: number;
    token: number;
  } | null>(null);
  const lastBounds = useRef<Bounds | null>(null);
  const lastZoom = useRef<number>(13);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryInput = useMemo(
    () => ({
      bounds,
      zoom,
      sources: sources.length ? sources : ALL_SOURCES,
      propertyTypes: propertyTypes.length ? propertyTypes : ALL_TYPES,
    }),
    [bounds, propertyTypes, sources, zoom],
  );

  const mapQuery = api.listings.getMap.useQuery(queryInput, {
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });

  const onViewport = useCallback((next: Bounds & { zoom: number }) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      const previous = lastBounds.current;
      const zoomChanged = next.zoom !== lastZoom.current;
      const movedEnough =
        !previous || overlapRatio(previous, next) < 0.82 || zoomChanged;
      if (!movedEnough) return;
      lastBounds.current = next;
      lastZoom.current = next.zoom;
      setBounds({
        south: next.south,
        west: next.west,
        north: next.north,
        east: next.east,
      });
      setZoom(next.zoom);
    }, 250);
  }, []);

  const onSelectCluster = useCallback((cluster: MapCluster) => {
    setSelected(null);
    setFocus({ lat: cluster.lat, lng: cluster.lng, token: Date.now() });
  }, []);

  const data = mapQuery.data;
  const errors = data?.errors ?? [];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-[500] flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
        <div className="pointer-events-auto max-w-md rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-xl backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
            Ziggybang
          </p>
          <h1 className="text-xl font-semibold">Korea rentals, in English</h1>
          <p className="mt-1 text-sm text-slate-400">
            Zigbang and Naver listings on one map, with KRW prices and jeonse
            vs monthly rent explained.
          </p>
        </div>

        <div className="pointer-events-auto flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-xl backdrop-blur">
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
              className={`rounded-full px-3 py-1 text-sm font-medium ${
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
          <span className="mx-1 h-6 w-px bg-white/10" />
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
              className={`rounded-full px-3 py-1 text-sm ${
                propertyTypes.includes(type)
                  ? "bg-white text-slate-950"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              {propertyTypeLabel[type]}
            </button>
          ))}
        </div>
      </header>

      <ListingMap
        clusters={data?.clusters ?? []}
        listings={data?.listings ?? []}
        selectedId={selected?.id}
        focus={focus}
        onViewport={onViewport}
        onSelectListing={setSelected}
        onSelectCluster={onSelectCluster}
      />

      <div className="pointer-events-none absolute left-4 top-40 z-[500] max-w-sm rounded-xl border border-white/10 bg-slate-950/85 px-3 py-2 text-sm text-slate-300 shadow-lg backdrop-blur md:top-28">
        {mapQuery.isFetching ? "Loading this map area…" : null}
        {!mapQuery.isFetching && data ? (
          <span>
            Zigbang {data.stats.zigbang.toLocaleString("en-US")} · Naver{" "}
            {data.stats.naver.toLocaleString("en-US")} ·{" "}
            {data.mode === "clusters" ? "groups" : "listings"}{" "}
            {data.stats.returned.toLocaleString("en-US")}
            {data.stats.truncated ? " (capped)" : ""}
          </span>
        ) : null}
        {errors.map((error) => (
          <p key={error.source} className="mt-1 text-amber-300">
            {friendlySourceError(error.source, error.message)}
          </p>
        ))}
      </div>

      {selected ? (
        <ListingPanel listing={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
