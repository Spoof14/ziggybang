import metroData from "./korea-metro.json";

export type MetroLine = {
  id: string;
  name: string;
  color: string;
  paths: [number, number][][];
};

export type MetroStation = {
  id: string;
  name: string;
  nameKo?: string | null;
  lat: number;
  lng: number;
  lines: string[];
};

type MetroFile = {
  attribution: string;
  lines: MetroLine[];
  stations: MetroStation[];
};

const metro = metroData as MetroFile;

export const metroLines: MetroLine[] = metro.lines;
export const metroStations: MetroStation[] = metro.stations;
export const metroAttribution = metro.attribution;

export const METRO_STATION_MIN_ZOOM = 12;
export const METRO_STORAGE_KEY = "ziggybang:metro";

export type GeoBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export function stationsInBounds(
  stations: MetroStation[],
  bounds: GeoBounds,
  limit = 160,
): MetroStation[] {
  const found: MetroStation[] = [];
  for (const station of stations) {
    if (
      station.lat >= bounds.south &&
      station.lat <= bounds.north &&
      station.lng >= bounds.west &&
      station.lng <= bounds.east
    ) {
      found.push(station);
      if (found.length >= limit) break;
    }
  }
  return found;
}

export function metroLineWeight(zoom: number): number {
  if (zoom >= 16) return 4.5;
  if (zoom >= 14) return 3.5;
  if (zoom >= 12) return 3;
  return 2.25;
}

export function stationTooltip(station: MetroStation): string {
  const lines = station.lines.join(" · ");
  return lines ? `${station.name} · ${lines}` : station.name;
}

export function readMetroPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(METRO_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeMetroPref(on: boolean) {
  try {
    window.localStorage.setItem(METRO_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}
