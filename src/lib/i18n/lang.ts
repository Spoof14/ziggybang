export const LANGS = ["en", "ko"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";
export const LANG_STORAGE_KEY = "ziggybang:lang";
export const LANG_PARAM = "lang";

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** Accepts "ko", "KO", "ko-KR", "en-US"; anything else is null. */
export function parseLang(value: unknown): Lang | null {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLang(base) ? base : null;
}

/** Priority: explicit `?lang=` param, then the stored choice, then English. */
export function resolveLang(input: { search?: string | null; stored?: string | null }): Lang {
  const fromUrl = parseLang(new URLSearchParams(input.search ?? "").get(LANG_PARAM));
  if (fromUrl) return fromUrl;
  return parseLang(input.stored) ?? DEFAULT_LANG;
}

/** `search` (with or without leading "?") with `lang` updated, only when it is already present. */
export function syncLangParam(search: string, lang: Lang): string {
  const params = new URLSearchParams(search);
  if (!params.has(LANG_PARAM)) return search ? (search.startsWith("?") ? search : `?${search}`) : "";
  params.set(LANG_PARAM, lang);
  const out = params.toString();
  return out ? `?${out}` : "";
}

/** Carries an existing `lang` param from `from` onto `next`. */
export function keepLangParam(next: string, from: string): string {
  const lang = new URLSearchParams(from).get(LANG_PARAM);
  if (!lang) return next;
  const params = new URLSearchParams(next);
  params.set(LANG_PARAM, lang);
  const out = params.toString();
  return out ? `?${out}` : "";
}

export function localeOf(lang: Lang): string {
  return lang === "ko" ? "ko-KR" : "en-US";
}

export function formatCount(n: number, lang: Lang): string {
  return n.toLocaleString(localeOf(lang));
}
