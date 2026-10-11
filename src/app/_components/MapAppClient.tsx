"use client";

import dynamic from "next/dynamic";

/** The map is client-only (Leaflet needs `window`). Next 15 requires `ssr: false` to live in a Client Component. */
const MapApp = dynamic(() => import("./MapApp"), { ssr: false });

export default function MapAppClient() {
  return <MapApp />;
}
