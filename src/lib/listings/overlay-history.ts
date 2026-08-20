export const OVERLAY_HISTORY_KEY = "ziggybangOverlay";

export function listingSheetInHistory(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  return (state as { [OVERLAY_HISTORY_KEY]?: unknown })[OVERLAY_HISTORY_KEY] === "listing";
}

export function withListingSheet(state: unknown, open: boolean): object {
  const base =
    state && typeof state === "object" ? { ...(state as Record<string, unknown>) } : {};
  if (open) {
    return { ...base, [OVERLAY_HISTORY_KEY]: "listing" };
  }
  const next = { ...base };
  delete next[OVERLAY_HISTORY_KEY];
  return next;
}

/** How history should move so Back closes the listing popup instead of the map. */
export function listingSheetSyncAction(
  sheetInHistory: boolean,
  sheetOpen: boolean,
): "push" | "back" | "none" {
  if (sheetOpen === sheetInHistory) return "none";
  return sheetOpen ? "push" : "back";
}
