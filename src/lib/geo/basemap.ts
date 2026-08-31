/**
 * Raster basemap for Leaflet. CARTO's public Voyager tiles now watermark
 * requests that omit an API key ("API KEY REQUIRED"). A free key from
 * https://carto.com/basemaps/apikey restores Voyager; without one we use
 * Esri's street map, which needs no key.
 */
export function leafletBasemap(): {
  url: string;
  attribution: string;
  subdomains?: string[];
  maxZoom: number;
} {
  const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
  if (cartoKey) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
      attribution: "© OpenStreetMap © CARTO",
      subdomains: ["a", "b", "c", "d"],
      maxZoom: 20,
    };
  }
  return {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles © Esri — Source: Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap",
    maxZoom: 19,
  };
}
