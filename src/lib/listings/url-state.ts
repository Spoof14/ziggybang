import { areaBuckets, type AreaBucketId } from "./area";
import { type ListSort, type ViewMode } from "./prefs";
import {
  propertyTypes,
  salesTypes,
  sources,
  type PropertyType,
  type SalesType,
  type Source,
} from "./types";

export type AppUrlState = {
  searchInput?: string;
  viewMode?: ViewMode;
  sources?: Source[];
  propertyTypes?: PropertyType[];
  salesTypes?: SalesType[];
  areaBucketIds?: AreaBucketId[];
  radiusM?: number;
  view?: { lat: number; lng: number; zoom: number };
  listSort?: ListSort;
};

const VIEW_MODES: ViewMode[] = ["map", "list", "saved"];
const LIST_SORTS: ListSort[] = ["featured", "newest", "deposit", "monthly", "size"];
const AREA_IDS = areaBuckets.map((bucket) => bucket.id);

function csv<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is T => (allowed as readonly string[]).includes(item));
}

export function parseAppUrl(search: string): AppUrlState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const viewMode = params.get("view");
  const sort = params.get("sort");
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const zoom = Number(params.get("z"));
  const radiusM = Number(params.get("r"));
  const next: AppUrlState = {};
  const q = params.get("q");
  if (q) next.searchInput = q;
  if (viewMode && VIEW_MODES.includes(viewMode as ViewMode)) {
    next.viewMode = viewMode as ViewMode;
  }
  const nextSources = csv(params.get("src"), sources);
  if (nextSources.length) next.sources = nextSources;
  const nextTypes = csv(params.get("type"), propertyTypes);
  if (nextTypes.length) next.propertyTypes = nextTypes;
  const nextSales = csv(params.get("sale"), salesTypes);
  if (nextSales.length) next.salesTypes = nextSales;
  const nextAreas = csv(params.get("size"), AREA_IDS);
  if (nextAreas.length) next.areaBucketIds = nextAreas;
  if (Number.isFinite(radiusM) && radiusM >= 50) {
    next.radiusM = Math.min(3000, Math.max(250, radiusM));
  }
  if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
    next.view = {
      lat,
      lng,
      zoom: Math.min(18, Math.max(7, zoom)),
    };
  }
  if (sort && LIST_SORTS.includes(sort as ListSort)) {
    next.listSort = sort as ListSort;
  }
  return next;
}

export function buildAppSearch(state: {
  searchInput: string;
  viewMode: ViewMode;
  sources: Source[];
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  radiusM: number;
  view: { lat: number; lng: number; zoom: number };
  listSort: ListSort;
}): string {
  const params = new URLSearchParams();
  if (state.searchInput.trim()) params.set("q", state.searchInput.trim());
  if (state.viewMode !== "map") params.set("view", state.viewMode);
  if (state.sources.length && state.sources.length < sources.length) {
    params.set("src", state.sources.join(","));
  }
  if (state.propertyTypes.length && state.propertyTypes.length < propertyTypes.length) {
    params.set("type", state.propertyTypes.join(","));
  }
  if (state.salesTypes.length && state.salesTypes.length < salesTypes.length) {
    params.set("sale", state.salesTypes.join(","));
  }
  if (state.areaBucketIds.length) params.set("size", state.areaBucketIds.join(","));
  if (state.radiusM !== 1200) params.set("r", String(state.radiusM));
  params.set("lat", state.view.lat.toFixed(4));
  params.set("lng", state.view.lng.toFixed(4));
  params.set("z", String(Math.round(state.view.zoom)));
  if (state.listSort !== "featured") params.set("sort", state.listSort);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function hasAppUrlState(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return ["q", "view", "src", "type", "sale", "size", "r", "lat", "lng", "z", "sort"].some(
    (key) => params.has(key),
  );
}
