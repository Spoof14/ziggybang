/**
 * Raster basemap for Leaflet. CARTO's public Voyager tiles now watermark
 * requests that omit an API key ("API KEY REQUIRED"). A free key from
 * https://carto.com/basemaps/apikey restores Voyager.
 *
 * Without a CARTO key we use OpenStreetMap DE tiles: they keep streets,
 * parks, and bilingual labels at listing zoom. Esri World Street Map
 * returns a blank "Map data not yet available" tile across Seoul from
 * zoom 14 up.
 */
export function leafletBasemap(): {
  url: string;
  attribution: string;
  subdomains: string[];
  maxZoom: number;
} {
  const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();
  if (cartoKey) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
      attribution: "© OpenStreetMap © CARTO",
      subdomains: ["a", "b", "c", "d"],
      maxZoom: 20,
    };
  }
  return {
    url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    // Leaflet always reads options.subdomains.length in _getSubdomain, even
    // when the tile URL has no {s}. Passing undefined from React overrides
    // Leaflet's default and crashes the map on load.
    subdomains: ["a", "b", "c"],
    maxZoom: 19,
  };
}
