import { type MapListing } from "./types";

const KEY = "ziggybang:saved:v1";
const MAX_SAVED = 80;

function getStorage(): Storage | null {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSavedHomes(): MapListing[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is MapListing => {
        return (
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as MapListing).id === "string" &&
          typeof (item as MapListing).url === "string" &&
          typeof (item as MapListing).lat === "number" &&
          typeof (item as MapListing).lng === "number"
        );
      })
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

export function saveSavedHomes(listings: MapListing[]) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(listings.slice(0, MAX_SAVED)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function toggleSavedHome(
  listings: MapListing[],
  listing: MapListing,
): MapListing[] {
  const exists = listings.some((item) => item.id === listing.id);
  if (exists) return listings.filter((item) => item.id !== listing.id);
  return [listing, ...listings].slice(0, MAX_SAVED);
}

export function isSavedHome(listings: MapListing[], id: string): boolean {
  return listings.some((item) => item.id === id);
}
