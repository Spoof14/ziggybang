"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { DivIcon, type Map as LeafletMap } from "leaflet";
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
  map: LeafletMap,
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
  focus: { lat: number; lng: number; zoom?: number; token: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    emitViewport(map, onViewport);
  }, [map, onViewport]);

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
        paddingTopLeft: [0, 150],
        duration: 0.35,
      },
    );
  }, [focus, map]);

  useMapEvents({
    moveend: () => emitViewport(map, onViewport),
    zoomend: () => emitViewport(map, onViewport),
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
  onSelect,
}: {
  clusters: MapCluster[];
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
            click: () => onSelect(cluster),
          }}
        />
      ))}
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
  onViewport,
  onSelectListing,
  onSelectCluster,
}: {
  clusters: MapCluster[];
  listings: MapListing[];
  selectedId?: string;
  focus: { lat: number; lng: number; zoom?: number; token: number } | null;
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
      <MapEvents onViewport={onViewport} focus={focus} />
      {clusterLayer}
      {markerLayer}
    </MapContainer>
  );
}
