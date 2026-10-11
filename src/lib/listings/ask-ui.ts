import { propertyTypes, sources, type MapListing, type PropertyType, type Source } from "./types";

/** URL param that marks the in-app listing preview opened from the Ask panel. */
export const PREVIEW_PARAM = "preview";
/** History-state flag set on the entry pushed when a preview opens. */
export const PREVIEW_HISTORY_KEY = "ziggybangAskPreview";

const KEY = "ziggybang:ask-ui:v1";
/** Ask UI state older than this is ignored (a fresh visit shouldn't reopen Ask). */
export const ASK_UI_TTL_MS = 30 * 60 * 1000;

export type PreviewRef = { source: Source; propertyType: PropertyType; sourceId: string };
export type AskUiState = { open: boolean; index: number; at: number };

export function previewKey(listing: PreviewRef): string {
  return `${listing.source}:${listing.propertyType}:${listing.sourceId}`;
}

export function parsePreviewKey(value: string | null | undefined): PreviewRef | null {
  if (!value) return null;
  const first = value.indexOf(":");
  const second = value.indexOf(":", first + 1);
  if (first < 1 || second < 0) return null;
  const source = value.slice(0, first);
  const propertyType = value.slice(first + 1, second);
  const sourceId = value.slice(second + 1).trim();
  if (!(sources as readonly string[]).includes(source)) return null;
  if (!(propertyTypes as readonly string[]).includes(propertyType)) return null;
  if (!sourceId) return null;
  return { source: source as Source, propertyType: propertyType as PropertyType, sourceId };
}

export function findPreviewListing<T extends { listing: MapListing }>(
  picks: readonly T[],
  ref: PreviewRef | null,
): T | null {
  if (!ref) return null;
  return (
    picks.find(
      (pick) =>
        pick.listing.source === ref.source &&
        pick.listing.propertyType === ref.propertyType &&
        pick.listing.sourceId === ref.sourceId,
    ) ?? null
  );
}

/** `search` (with or without leading "?") with the preview param set or removed. */
export function withPreviewParam(search: string, key: string | null): string {
  const params = new URLSearchParams(search);
  if (key) params.set(PREVIEW_PARAM, key);
  else params.delete(PREVIEW_PARAM);
  const out = params.toString();
  return out ? `?${out}` : "";
}

export function previewFromSearch(search: string): PreviewRef | null {
  return parsePreviewKey(new URLSearchParams(search).get(PREVIEW_PARAM));
}

export function hasPreviewHistory(state: unknown): boolean {
  return Boolean(state && typeof state === "object" && (state as Record<string, unknown>)[PREVIEW_HISTORY_KEY]);
}

function storage(): Storage | null {
  try {
    return globalThis.window?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function parseAskUi(raw: string | null, now = Date.now()): AskUiState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<AskUiState> | null;
    if (!data || typeof data !== "object") return null;
    if (typeof data.at !== "number" || now - data.at > ASK_UI_TTL_MS) return null;
    const raw = data.index;
    const index = typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
    return { open: data.open === true, index, at: data.at };
  } catch {
    return null;
  }
}

export function loadAskUi(): AskUiState | null {
  return parseAskUi(storage()?.getItem(KEY) ?? null);
}

/** Merges a patch into the stored state (open flag and carousel pick index). */
export function patchAskUi(patch: Partial<Pick<AskUiState, "open" | "index">>): void {
  const store = storage();
  if (!store) return;
  try {
    const current = parseAskUi(store.getItem(KEY)) ?? { open: false, index: 0, at: 0 };
    store.setItem(KEY, JSON.stringify({ ...current, ...patch, at: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}
