"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { type MapCluster, type MapListing } from "~/lib/listings/types";

const SEOUL: [number, number] = [37.5665, 126.978];

function sourceColor(sources: Partial<Record<"zigbang" | "naver", number>>) {
  const hasZigbang = (sources.zigbang ?? 0) > 0;
  const hasNaver = (sources.naver ?? 0) > 0;
  if (hasZigbang && hasNaver) return "#6366f1";
  if (hasNaver) return "#03c75a";
  return "#ff6b2c";
}

function emitViewport(
  map: { getBounds: () => { getSouth: () => number; getWest: () => number; getNorth: () => number; getEast: () => number }; getZoom: () => number },
  onViewport: (next: {
    south: number;
    west: number;
    north: number;
    east: number;
    zoom: number;
  }) => void,
) {
  const bounds = map.getBounds();
  onViewport({
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
    zoom: map.getZoom(),
  });
}

function MapEvents({
  onViewport,
  focus,
}: {
  onViewport: (next: {
    south: number;
    west: number;
    north: number;
    east: number;
    zoom: number;
  }) => void;
  focus: { lat: number; lng: number; token: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    emitViewport(map, onViewport);
  }, [map, onViewport]);

  useEffect(() => {
    if (!focus) return;
    map.setView([focus.lat, focus.lng], Math.min(map.getZoom() + 2, 17));
  }, [focus, map]);

  useMapEvents({
    moveend: (event) => emitViewport(event.target, onViewport),
  });

  return null;
}

function ClusterLayer({
  clusters,
  onSelect,
}: {
  clusters: MapCluster[];
  onSelect: (cluster: MapCluster) => void;
}) {
  return (
    <>
      {clusters.map((cluster) => {
        const radius = Math.min(28, 10 + Math.log2(cluster.count + 1) * 4);
        return (
          <CircleMarker
            key={cluster.id}
            center={[cluster.lat, cluster.lng]}
            radius={radius}
            pathOptions={{
              color: "#0f172a",
              weight: 1,
              fillColor: sourceColor(cluster.sources),
              fillOpacity: 0.86,
            }}
            eventHandlers={{
              click: () => onSelect(cluster),
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent>
              {cluster.count.toLocaleString()}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

function MarkerLayer({
  listings,
  selectedId,
  onSelect,
}: {
  listings: MapListing[];
  selectedId?: string;
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
            fillColor: listing.source === "naver" ? "#03c75a" : "#ff6b2c",
            fillOpacity: 0.92,
          }}
          eventHandlers={{
            click: () => onSelect(listing),
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {listing.title ?? listing.sourceId}
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
  onViewport,
  onSelectListing,
  onSelectCluster,
}: {
  clusters: MapCluster[];
  listings: MapListing[];
  selectedId?: string;
  focus: { lat: number; lng: number; token: number } | null;
  onViewport: (next: {
    south: number;
    west: number;
    north: number;
    east: number;
    zoom: number;
  }) => void;
  onSelectListing: (listing: MapListing) => void;
  onSelectCluster: (cluster: MapCluster) => void;
}) {
  const clusterLayer = useMemo(
    () => <ClusterLayer clusters={clusters} onSelect={onSelectCluster} />,
    [clusters, onSelectCluster],
  );
  const markerLayer = useMemo(
    () => (
      <MarkerLayer
        listings={listings}
        selectedId={selectedId}
        onSelect={onSelectListing}
      />
    ),
    [listings, onSelectListing, selectedId],
  );

  return (
    <MapContainer
      center={SEOUL}
      zoom={13}
      className="h-full w-full"
      zoomControl
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEvents onViewport={onViewport} focus={focus} />
      {clusterLayer}
      {markerLayer}
    </MapContainer>
  );
}
