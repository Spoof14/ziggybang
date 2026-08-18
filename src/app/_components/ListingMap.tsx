"use client";

import { useEffect, useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { DivIcon, DomEvent, type Map as LeafletMap } from "leaflet";
import { isUsableMapViewport } from "~/lib/geo/bounds";
import { type CircleFilter, type LatLng } from "~/lib/geo/shape";
import { type MapCluster, type MapListing } from "~/lib/listings/types";

const SEOUL: [number, number] = [37.5665, 126.978];

function sourceColor(sources: Partial<Record<"zigbang" | "naver" | "peterpan", number>>) {
  const active = (["zigbang", "naver", "peterpan"] as const).filter(
    (source) => (sources[source] ?? 0) > 0,
  );
  if (active.length > 1) return "#6366f1";
  if (active[0] === "naver") return "#03c75a";
  if (active[0] === "peterpan") return "#f59e0b";
  return "#ff6b2c";
}

function listingColor(source: MapListing["source"]) {
  if (source === "naver") return "#03c75a";
  if (source === "peterpan") return "#f59e0b";
  return "#ff6b2c";
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
      if (tool === "pan") return;
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
            color: "#0f172a",
            weight: selectedId === listing.id ? 2 : 1,
            fillColor: listingColor(listing.source),
            fillOpacity: 0.92,
          }}
          eventHandlers={{
            click: (event) => {
              DomEvent.stopPropagation(event);
              if (tool !== "pan") return;
              onSelect(listing);
            },
          }}
        />
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
      <ClusterLayer clusters={clusters} tool={tool} onSelect={onSelectCluster} />
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
      preferCanvas
    >
      <TileLayer
        attribution="© OpenStreetMap © CARTO"
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        maxZoom={20}
      />
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
          positions={polygon.map((point) => [point.lat, point.lng] as [number, number])}
          pathOptions={{ color: "#a78bfa", weight: 2, fillOpacity: 0.12 }}
        />
      ) : null}
      {draftPoints.length ? (
        <Polyline
          positions={draftPoints.map((point) => [point.lat, point.lng] as [number, number])}
          pathOptions={{ color: "#a78bfa", weight: 2, dashArray: "6 6" }}
        />
      ) : null}
      {clusterLayer}
      {markerLayer}
    </MapContainer>
  );
}
