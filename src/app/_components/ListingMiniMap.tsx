"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";

export function ListingMiniMap({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      minZoom={12}
      maxZoom={18}
      className="h-56 w-full rounded-xl"
      zoomControl={false}
      attributionControl={false}
      dragging
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
      />
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
