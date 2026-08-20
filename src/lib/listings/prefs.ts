import { type CircleFilter, type LatLng } from "~/lib/geo/shape";
import { ageFilters, type AgeFilter } from "./age";
import { areaBuckets, type AreaBucketId } from "./area";
import { normalizeBuildingAgeFilter } from "./building-age";
import { floorFilters, type FloorFilter } from "./floor";
import { normalizePriceFilter, type PriceFilter } from "./price";
import {
  propertyTypes,
  salesTypes,
  sources,
  type PropertyType,
  type SalesType,
  type Source,
} from "./types";

export type ViewMode = "map" | "list" | "best" | "saved";
export type ListSort = "featured" | "newest" | "deposit" | "monthly" | "size";

export type SavedPrefs = {
  sources: Source[];
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  searchInput: string;
  viewMode: ViewMode;
  radiusM: number;
  circle: CircleFilter | null;
  polygon: LatLng[] | null;
  view: { lat: number; lng: number; zoom: number } | null;
  uiCompact: boolean;
  listSort: ListSort;
  foreignerOk?: boolean;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  maxBuildingAge?: number;
} & PriceFilter;

const KEY = "ziggybang:prefs:v1";
const AREA_IDS = areaBuckets.map((bucket) => bucket.id);
const VIEW_MODES: ViewMode[] = ["map", "list", "best", "saved"];
const LIST_SORTS: ListSort[] = ["featured", "newest", "deposit", "monthly", "size"];

function pickKnown<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value),
  );
}

function asCircle(value: unknown): CircleFilter | null {
  if (!value || typeof value !== "object") return null;
  const circle = value as Partial<CircleFilter>;
  if (
    typeof circle.lat !== "number" ||
    typeof circle.lng !== "number" ||
    typeof circle.radiusM !== "number"
  ) {
    return null;
  }
  return {
    lat: circle.lat,
    lng: circle.lng,
    radiusM: Math.min(20_000, Math.max(50, circle.radiusM)),
  };
}

function asView(value: unknown): SavedPrefs["view"] {
  if (!value || typeof value !== "object") return null;
  const view = value as { lat?: number; lng?: number; zoom?: number };
  if (
    typeof view.lat !== "number" ||
    typeof view.lng !== "number" ||
    typeof view.zoom !== "number"
  ) {
    return null;
  }
  return {
    lat: view.lat,
    lng: view.lng,
    zoom: Math.min(18, Math.max(7, view.zoom)),
  };
}

function asPolygon(value: unknown): LatLng[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const point = item as Partial<LatLng>;
    if (typeof point.lat !== "number" || typeof point.lng !== "number") return [];
    return [{ lat: point.lat, lng: point.lng }];
  });
  return points.length >= 3 ? points.slice(0, 32) : null;
}

function getStorage(): Storage | null {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadPrefs(): SavedPrefs | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPrefs>;
    const nextSources = pickKnown(parsed.sources, sources);
    const nextTypes = pickKnown(parsed.propertyTypes, propertyTypes);
    const nextSales = pickKnown(parsed.salesTypes, salesTypes);
    const nextAreas = pickKnown(parsed.areaBucketIds, AREA_IDS);
    const restoredSources =
      nextSources.includes("zigbang") &&
      nextSources.includes("naver") &&
      !nextSources.includes("peterpan") &&
      nextSources.length === 2
        ? [...nextSources, "peterpan" as const]
        : nextSources;
    return {
      sources: restoredSources.length ? restoredSources : [...sources],
      propertyTypes: nextTypes.length ? nextTypes : [...propertyTypes],
      salesTypes: nextSales.length ? nextSales : [...salesTypes],
      areaBucketIds: nextAreas,
      searchInput: typeof parsed.searchInput === "string" ? parsed.searchInput : "",
      viewMode:
        parsed.viewMode && VIEW_MODES.includes(parsed.viewMode)
          ? parsed.viewMode
          : "map",
      radiusM:
        typeof parsed.radiusM === "number" && Number.isFinite(parsed.radiusM)
          ? Math.min(3000, Math.max(250, parsed.radiusM))
          : 1200,
      circle: asCircle(parsed.circle),
      polygon: asPolygon(parsed.polygon),
      view: asView(parsed.view),
      uiCompact: parsed.uiCompact === true,
      listSort:
        parsed.listSort && LIST_SORTS.includes(parsed.listSort)
          ? parsed.listSort
          : "featured",
      foreignerOk: parsed.foreignerOk === true,
      floorFilter: pickKnown([parsed.floorFilter], floorFilters)[0],
      ageFilter: pickKnown([parsed.ageFilter], ageFilters)[0],
      ...normalizeBuildingAgeFilter({ maxBuildingAge: parsed.maxBuildingAge }),
      ...normalizePriceFilter({
        minDeposit: parsed.minDeposit,
        maxDeposit: parsed.maxDeposit,
        minRent: parsed.minRent,
        maxRent: parsed.maxRent,
      }),
    };
  } catch {
    return null;
  }
}

export function savePrefs(prefs: SavedPrefs) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}
