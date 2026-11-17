import { type Lang, t } from "~/lib/i18n";
import { LANG_PARAM } from "~/lib/i18n/lang";
import { PREVIEW_PARAM } from "./ask-ui";

const KEY = "ziggybang:saved-searches:v1";
const MAX_SAVED = 24;

export type SavedSearch = {
  id: string;
  name: string;
  /** App search string (`?lat=…`) without language / Ask preview params. */
  search: string;
  savedAt: number;
};

function getStorage(): Storage | null {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function normalizeSavedSearchQuery(search: string): string {
  const normalized = search.startsWith("?") ? search : search ? `?${search}` : "";
  const params = new URLSearchParams(normalized.startsWith("?") ? normalized.slice(1) : normalized);
  params.delete(LANG_PARAM);
  params.delete(PREVIEW_PARAM);
  const out = params.toString();
  return out ? `?${out}` : "";
}

export function defaultSavedSearchName(
  input: { chips: string[]; index: number },
  lang: Lang,
): string {
  const summary = input.chips.join(" · ").trim();
  if (summary) {
    const trimmed = summary.length > 48 ? `${summary.slice(0, 45).trimEnd()}…` : summary;
    return trimmed;
  }
  return t(lang, "savedSearch.defaultName", { n: input.index + 1 });
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseStored(raw: string): SavedSearch[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedSearch => {
        return (
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as SavedSearch).id === "string" &&
          typeof (item as SavedSearch).name === "string" &&
          typeof (item as SavedSearch).search === "string" &&
          typeof (item as SavedSearch).savedAt === "number"
        );
      })
      .map((item) => ({
        ...item,
        search: normalizeSavedSearchQuery(item.search),
      }))
      .filter((item) => item.search.length > 1)
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

export function loadSavedSearches(): SavedSearch[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    return parseStored(raw);
  } catch {
    return [];
  }
}

export function saveSavedSearches(items: SavedSearch[]) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(items.slice(0, MAX_SAVED)));
  } catch {
    /* quota / private mode */
  }
}

export function addSavedSearch(item: Omit<SavedSearch, "id" | "savedAt">): SavedSearch[] {
  const current = loadSavedSearches();
  const search = normalizeSavedSearchQuery(item.search);
  const duplicate = current.find((entry) => entry.search === search);
  if (duplicate) {
    const renamed = current.map((entry) =>
      entry.id === duplicate.id ? { ...entry, name: item.name.trim() || entry.name } : entry,
    );
    saveSavedSearches(renamed);
    return renamed;
  }
  const next: SavedSearch = {
    id: newId(),
    name: item.name.trim() || "Search",
    search,
    savedAt: Date.now(),
  };
  const merged = [next, ...current].slice(0, MAX_SAVED);
  saveSavedSearches(merged);
  return merged;
}

export function renameSavedSearch(id: string, name: string): SavedSearch[] {
  const trimmed = name.trim();
  if (!trimmed) return loadSavedSearches();
  const next = loadSavedSearches().map((item) => (item.id === id ? { ...item, name: trimmed } : item));
  saveSavedSearches(next);
  return next;
}

export function deleteSavedSearch(id: string): SavedSearch[] {
  const next = loadSavedSearches().filter((item) => item.id !== id);
  saveSavedSearches(next);
  return next;
}

export function isDuplicateSavedSearch(search: string, items: SavedSearch[]): boolean {
  const normalized = normalizeSavedSearchQuery(search);
  return items.some((item) => item.search === normalized);
}