export const LANGS = ["en", "ko"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";
export const LANG_STORAGE_KEY = "ziggybang:lang";
export const LANG_PARAM = "lang";
export const LANG_COOKIE = "ziggy_lang";
/** Request header the middleware sets so server components know the resolved language. */
export const LANG_HEADER = "x-ziggy-lang";

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

/**
 * `search` (with or without leading "?") with the language written in: `?lang=ko`
 * for Korean, no `lang` param for English (the default). Other params are kept.
 */
export function syncLangParam(search: string, lang: Lang): string {
  const params = new URLSearchParams(search);
  if (lang === DEFAULT_LANG) params.delete(LANG_PARAM);
  else params.set(LANG_PARAM, lang);
  const out = params.toString();
  return out ? `?${out}` : "";
}

/** Appends the language (when not English) to an internal path, keeping existing query/hash. */
export function withLangPath(path: string, lang: Lang): string {
  if (lang === DEFAULT_LANG) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const q = noHash.indexOf("?");
  const base = q >= 0 ? noHash.slice(0, q) : noHash;
  const search = syncLangParam(q >= 0 ? noHash.slice(q) : "", lang);
  return `${base}${search}${hash}`;
}

/** Server-side resolution: explicit `?lang=` wins, then the cookie, then English. */
export function resolveServerLang(param: unknown, cookie: unknown): Lang {
  return parseLang(Array.isArray(param) ? param[0] : param) ?? parseLang(cookie) ?? DEFAULT_LANG;
}

/** Carries an existing `lang` param from `from` onto `next`. */
export function keepLangParam(next: string, from: string): string {
  const lang = parseLang(new URLSearchParams(from).get(LANG_PARAM));
  if (!lang || lang === DEFAULT_LANG) return next;
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
