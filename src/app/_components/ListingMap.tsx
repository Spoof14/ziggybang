"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  Control,
  DivIcon,
  DomEvent,
  DomUtil,
  type Map as LeafletMap,
} from "leaflet";
import { isUsableMapViewport } from "~/lib/geo/bounds";
import { type CircleFilter, type LatLng } from "~/lib/geo/shape";
import { formatPrice, propertyTypeLabel } from "~/lib/listings/copy";
import { type MapCluster, type MapListing } from "~/lib/listings/types";

const SEOUL: [number, number] = [37.5665, 126.978];
const USER_ZOOM = 16;

function flyToUserLocation(
  map: LeafletMap,
  point: { lat: number; lng: number; accuracy: number },
) {
  if (point.accuracy > 150) {
    const pad = point.accuracy / 111_320;
    map.flyToBounds(
      [
        [point.lat - pad, point.lng - pad],
        [point.lat + pad, point.lng + pad],
      ],
      { maxZoom: USER_ZOOM, padding: [48, 48], duration: 0.55 },
    );
    return;
  }
  map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), USER_ZOOM), {
    duration: 0.55,
  });
}

function sourceColor(
  sources: Partial<Record<"zigbang" | "naver" | "peterpan", number>>,
) {
  const active = (["zigbang", "naver", "peterpan"] as const).filter(
    (source) => (sources[source] ?? 0) > 0,
  );
  if (active.length > 1) return "#6366f1";
  if (active[0] === "naver") return "#03c75a";
  if (active[0] === "peterpan") return "#f59e0b";
  return "#ff6b2c";
}

function listingFill(type: MapListing["propertyType"]) {
  if (type === "apartment") return "#38bdf8";
  if (type === "officetel") return "#8b5cf6";
  if (type === "villa") return "#eab308";
  return "#ff6b2c";
}

function listingStroke(source: MapListing["source"]) {
  return sourceColor({ [source]: 1 });
}

function listingTooltip(listing: MapListing) {
  const price = formatPrice(listing);
  const kind = propertyTypeLabel[listing.propertyType];
  return price ? `${kind} · ${price}` : kind;
}

function emitViewport(
  map: LeafletMap,
  onViewport: (next: {
    south: number;
    west: number;
    north: number;
    east: number;
    zoom: number;
  }) => void,
) {
  const size = map.getSize();
  const leafletBounds = map.getBounds();
  const bounds = {
    south: leafletBounds.getSouth(),
    west: leafletBounds.getWest(),
    north: leafletBounds.getNorth(),
    east: leafletBounds.getEast(),
  };
  if (!isUsableMapViewport(size, bounds)) return;
  onViewport({
    ...bounds,
    zoom: map.getZoom(),
  });
}

function MapEvents({
  onViewport,
  focus,
  tool,
  onMapClick,
  onFinishDraw,
}: {
  onViewport: (next: {
    south: number;
    west: number;
    north: number;
    east: number;
    zoom: number;
  }) => void;
  focus: { lat: number; lng: number; zoom?: number; token: number } | null;
  tool: "pan" | "radius" | "draw";
  onMapClick: (point: LatLng) => void;
  onFinishDraw: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    emitViewport(map, onViewport);
  }, [map, onViewport]);

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = tool === "pan" ? "" : "crosshair";
    if (tool === "pan") {
      map.doubleClickZoom.enable();
    } else {
      map.doubleClickZoom.disable();
    }
    const observer = new ResizeObserver(() => {
      const size = map.getSize();
      if (size.x < 80 || size.y < 80) return;
      map.invalidateSize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      container.style.cursor = "";
    };
  }, [map, tool]);

  useEffect(() => {
    if (!focus) return;
    if (focus.zoom) {
      map.setView([focus.lat, focus.lng], focus.zoom, { animate: true });
      return;
    }
    const pad = 0.0008;
    map.flyToBounds(
      [
        [focus.lat - pad, focus.lng - pad],
        [focus.lat + pad, focus.lng + pad],
      ],
      {
        maxZoom: Math.min(map.getZoom() + 2, 17),
        paddingTopLeft: [0, 24],
        duration: 0.35,
      },
    );
  }, [focus, map]);

  useMapEvents({
    moveend: () => emitViewport(map, onViewport),
    zoomend: () => emitViewport(map, onViewport),
    click: (event) => {
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
    dblclick: (event) => {
      if (tool !== "draw") return;
      DomEvent.stop(event);
      onFinishDraw();
    },
  });

  return null;
}

function LocateIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {spinning ? (
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeDasharray="32 18"
        />
      ) : (
        <>
          <circle cx="12" cy="12" r="2.4" fill="currentColor" />
          <circle
            cx="12"
            cy="12"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

function LocateMeControl() {
  const map = useMap();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<
    "idle" | "locating" | "denied" | "unavailable"
  >("idle");
  const [me, setMe] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);

  useEffect(() => {
    const control = new Control({ position: "bottomright" });
    control.onAdd = () => {
      const el = DomUtil.create(
        "div",
        "leaflet-bar leaflet-control leaflet-control-locate",
      );
      DomEvent.disableClickPropagation(el);
      DomEvent.disableScrollPropagation(el);
      return el;
    };
    control.addTo(map);
    setHost(control.getContainer() ?? null);
    return () => {
      control.remove();
      setHost(null);
    };
  }, [map]);

  useEffect(() => {
    if (status !== "denied" && status !== "unavailable") return;
    const timer = window.setTimeout(() => setStatus("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const locate = () => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : 40,
        };
        setMe(next);
        setStatus("idle");
        flyToUserLocation(map, next);
      },
      (error) => {
        setStatus(
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 },
    );
  };

  const title =
    status === "denied"
      ? "Location permission denied"
      : status === "unavailable"
        ? "Location unavailable"
        : status === "locating"
          ? "Finding your location…"
          : "Center on me";

  return (
    <>
      {me ? (
        <>
          <Circle
            center={[me.lat, me.lng]}
            radius={Math.max(me.accuracy, 24)}
            interactive={false}
            pathOptions={{
              color: "#0284c7",
              weight: 1,
              fillColor: "#38bdf8",
              fillOpacity: 0.16,
            }}
          />
          <CircleMarker
            center={[me.lat, me.lng]}
            radius={7}
            interactive={false}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#0ea5e9",
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              You are here
            </Tooltip>
          </CircleMarker>
        </>
      ) : null}
      {host
        ? createPortal(
            <a
              href="#"
              role="button"
              title={title}
              aria-label={title}
              aria-busy={status === "locating"}
              className={
                status === "locating"
                  ? "is-locating"
                  : status === "idle"
                    ? undefined
                    : "is-error"
              }
              onClick={(event) => {
                event.preventDefault();
                if (status === "locating") return;
                locate();
              }}
            >
              <LocateIcon spinning={status === "locating"} />
            </a>,
            host,
          )
        : null}
    </>
  );
}

function clusterIcon(count: number, color: string) {
  const size = Math.min(44, 26 + Math.log2(count + 1) * 5);
  return new DivIcon({
    className: "listing-cluster",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="listing-cluster-inner" style="--cluster-size:${size}px;--cluster-color:${color}">${count.toLocaleString("en-US")}</span>`,
  });
}

function ClusterLayer({
  clusters,
  tool,
  onSelect,
}: {
  clusters: MapCluster[];
  tool: "pan" | "radius" | "draw";
  onSelect: (cluster: MapCluster) => void;
}) {
  return (
    <>
      {clusters.map((cluster) => (
        <Marker
          key={cluster.id}
          position={[cluster.lat, cluster.lng]}
          icon={clusterIcon(cluster.count, sourceColor(cluster.sources))}
          eventHandlers={{
            click: (event) => {
              if (tool !== "pan") return;
              DomEvent.stopPropagation(event);
              onSelect(cluster);
            },
          }}
        />
      ))}
    </>
  );
}

function MarkerLayer({
  listings,
  selectedId,
  tool,
  onSelect,
}: {
  listings: MapListing[];
  selectedId?: string;
  tool: "pan" | "radius" | "draw";
  onSelect: (listing: MapListing) => void;
}) {
  return (
    <>
      {listings.map((listing) => (
        <CircleMarker
          key={listing.id}
          center={[listing.lat, listing.lng]}
          radius={selectedId === listing.id ? 9 : 6}
          pathOptions={{
            color: listingStroke(listing.source),
            weight: selectedId === listing.id ? 3 : 1.5,
            fillColor: listingFill(listing.propertyType),
            fillOpacity: 0.92,
          }}
          eventHandlers={{
            click: (event) => {
              DomEvent.stopPropagation(event);
              if (tool !== "pan") return;
              onSelect(listing);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
            {listingTooltip(listing)}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export function ListingMap({
  clusters,
  listings,
  selectedId,
  focus,
  circle,
  polygon,
  draftPoints,
  tool,
  onViewport,
  onSelectListing,
  onSelectCluster,
  onMapClick,
  onFinishDraw,
}: {
  clusters: MapCluster[];
  listings: MapListing[];
  selectedId?: string;
  focus: { lat: number; lng: number; zoom?: number; token: number } | null;
  circle: CircleFilter | null;
  polygon: LatLng[] | null;
  draftPoints: LatLng[];
  tool: "pan" | "radius" | "draw";
  onViewport: (next: {
    south: number;
    west: number;
    north: number;
    east: number;
    zoom: number;
  }) => void;
  onSelectListing: (listing: MapListing) => void;
  onSelectCluster: (cluster: MapCluster) => void;
  onMapClick: (point: LatLng) => void;
  onFinishDraw: () => void;
}) {
  const clusterLayer = useMemo(
    () => (
      <ClusterLayer
        clusters={clusters}
        tool={tool}
        onSelect={onSelectCluster}
      />
    ),
    [clusters, onSelectCluster, tool],
  );
  const markerLayer = useMemo(
    () => (
      <MarkerLayer
        listings={listings}
        selectedId={selectedId}
        tool={tool}
        onSelect={onSelectListing}
      />
    ),
    [listings, onSelectListing, selectedId, tool],
  );

  return (
    <MapContainer
      center={SEOUL}
      zoom={13}
      minZoom={7}
      maxZoom={18}
      className="h-full w-full"
      zoomControl={false}
      preferCanvas={listings.length > 80}
    >
      <TileLayer
        attribution="© OpenStreetMap © CARTO"
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        maxZoom={20}
      />
      <LocateMeControl />
      <ZoomControl position="bottomright" />
      <MapEvents
        onViewport={onViewport}
        focus={focus}
        tool={tool}
        onMapClick={onMapClick}
        onFinishDraw={onFinishDraw}
      />
      {circle ? (
        <Circle
          center={[circle.lat, circle.lng]}
          radius={circle.radiusM}
          pathOptions={{ color: "#38bdf8", weight: 2, fillOpacity: 0.12 }}
        />
      ) : null}
      {polygon && polygon.length >= 3 ? (
        <Polygon
          positions={polygon.map(
            (point) => [point.lat, point.lng] as [number, number],
          )}
          pathOptions={{ color: "#a78bfa", weight: 2, fillOpacity: 0.12 }}
        />
      ) : null}
      {draftPoints.length ? (
        <Polyline
          positions={draftPoints.map(
            (point) => [point.lat, point.lng] as [number, number],
          )}
          pathOptions={{ color: "#a78bfa", weight: 2, dashArray: "6 6" }}
        />
      ) : null}
      {clusterLayer}
      {markerLayer}
    </MapContainer>
  );
}
