"use client";

import "leaflet/dist/leaflet.css";
import { type Map as LeafletMap } from "leaflet";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { leafletBasemap } from "~/lib/geo/basemap";
import { MetroLayer } from "./MetroLayer";

const BASEMAP = leafletBasemap();

/** The preview map is decorative context: named, and out of the tab order. */
function describeMap(map: LeafletMap | null) {
  const container = map?.getContainer();
  if (!container) return;
  container.setAttribute("tabindex", "-1");
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", "Map showing listing location");
}

export function ListingMiniMap({
  lat,
  lng,
  className = "h-56 w-full",
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  return (
    <MapContainer
      ref={describeMap}
      key={`${lat},${lng}`}
      center={[lat, lng]}
      zoom={16}
      minZoom={12}
      maxZoom={18}
      className={className}
      zoomControl={false}
      attributionControl={false}
      dragging
      scrollWheelZoom={false}
    >
      <TileLayer
        url={BASEMAP.url}
        attribution={BASEMAP.attribution}
        subdomains={BASEMAP.subdomains}
        maxZoom={BASEMAP.maxZoom}
      />
      <MetroLayer toggle={false} />
      <CircleMarker
        center={[lat, lng]}
        radius={9}
        pathOptions={{
          color: "#0f172a",
          weight: 2,
          fillColor: "#38bdf8",
          fillOpacity: 0.95,
        }}
      />
    </MapContainer>
  );
}
