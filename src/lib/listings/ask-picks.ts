/**
 * Ask → "10 picks". Pure, shared (server + client) logic: the constraint
 * model and its chips, hard filtering, deterministic fallback scoring, and
 * validation of whatever the AI hands back.
 */
import { distanceM, pointInCircle } from "~/lib/geo/shape";
import { placeDisplayName } from "~/lib/geo/places";
import { type SearchSnapshot } from "./ai-search";
import { DEFAULT_LANG, t, type Lang, type MessageKey } from "~/lib/i18n";
import { ageFilterText, type AgeFilter } from "./age";
import { areaBucketHint, areaBuckets, toPyeong, type AreaBucketId } from "./area";
import { buildingAgeYears, describeBuildingAgeFilter } from "./building-age";
import { formatFloor, formatKrwFromManwon, propertyTypeText, salesTypeText } from "./copy";
import {
  BASEMENT_OR_ROOFTOP_WORDS,
  buildAskSummary,
  CHEAP_WORDS,
  collapseDuplicates,
  diversify,
  effectiveMonthlyManwon,
  floorKind,
  hasAnyPhoto,
  areaLabel,
  listingRooms,
  reasonIsGrounded,
  roomsLabel,
  sizeClass,
  MAX_NEAR_DUPLICATES,
} from "./ask-quality";
import { approxCommuteMin, commuteRadiusM, MAX_COMMUTE_RADIUS_M, type AskCommute, type SimilarAnchor } from "./ask-followup";
import { priceText, reasonPriceConsistent, relocalizeAssumption, type ReasonContext } from "./ask-reason";
import { filterListings, isNaverClusterListing } from "./filter";
import { floorFilterText, type FloorFilter } from "./floor";
import { listingHasPhotos } from "./photo";
import { normalizePriceFilter, type PriceFilter } from "./price";
import {
  propertyTypes as ALL_PROPERTY_TYPES,
  type ListingDetail,
  type MapListing,
  type PropertyType,
  type SalesType,
} from "./types";

export const ASK_PICK_COUNT = 10;
/** Compact candidate summaries sent to the AI. */
export const ASK_MAX_CANDIDATES = 30;
/** Below this many hard-filtered candidates the search radius is widened once. */
export const ASK_MIN_CANDIDATES = 12;
export const DEFAULT_ASK_SALES: SalesType[] = ["jeonse", "wolse"];
export const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };

export type AskPlace = {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** "place" = named in the request; "viewport" = fell back to the map view. */
  kind: "place" | "viewport";
};

export type AskConstraints = {
  place?: AskPlace;
  /** Undefined = any type. */
  propertyTypes?: PropertyType[];
  /** Undefined = jeonse + monthly rent. */
  salesTypes?: SalesType[];
  areaBucketIds?: AreaBucketId[];
  /** Best-effort room count (2 = two-room); the data rarely states it. */
  rooms?: number;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  maxBuildingAge?: number;
  foreignerOk?: boolean;
  hasPhotos?: boolean;
  /** Soft wishes ("quiet", "subway"). They rank; they never exclude. */
  preferences?: string[];
  /** "Within 30 min of Gangnam": filters and ranks by an approximate straight-line commute. */
  commute?: AskCommute;
  /** "Similar to this": the anchor listing is excluded from its own picks. */
  similarTo?: SimilarAnchor;
} & PriceFilter;

export type AskPick = {
  rank: number;
  listing: MapListing;
  reason: string;
  reasonSource: "ai" | "basic";
  distanceM?: number;
  /** Approximate door-to-door minutes to `constraints.commute` (rough straight-line estimate). */
  commuteMin?: number;
  /** Other listings of the same complex/price/size that were folded into or left out of this pick. */
  similar?: number;
  /** What the full listing stated (tags, subway walk) before it was slimmed; lets a language switch rewrite the reason without re-fetching. */
  facts?: { tags: string[]; subwayWalkMin?: number };
};

export type AskFallbackReason =
  | "rate_limited"
  | "quota"
  | "auth"
  | "timeout"
  | "error"
  | "unconfigured";

export type AskSuggestion = {
  label: string;
  action:
    | { type: "remove"; key: string }
    | { type: "widen_budget" }
    | { type: "widen_radius" };
};

export type AskPicksResult =
  | {
      status: "ok";
      picks: AskPick[];
      summary: string;
      assumptions: string[];
      constraints: AskConstraints;
      provider: "openai" | "local";
      fallbackReason?: AskFallbackReason;
      candidateCount: number;
      radiusM: number;
      widened: boolean;
      sourceErrors: string[];
      elapsedMs: number;
      timingsMs?: { interpret?: number; fetch: number; rank: number };
    }
  | {
      status: "empty";
      summary: string;
      assumptions: string[];
      suggestions: AskSuggestion[];
      constraints: AskConstraints;
      provider: "openai" | "local";
      fallbackReason?: AskFallbackReason;
      candidateCount: number;
      radiusM: number;
      widened: boolean;
      sourceErrors: string[];
      elapsedMs: number;
    }
  | { status: "off_topic"; reply: string };

export type AskInterpretResult =
  | {
      status: "ok";
      constraints: AskConstraints;
      assumptions: string[];
      provider: "openai" | "local";
      fallbackReason?: AskFallbackReason;
    }
  | { status: "off_topic"; reply: string };

export function askFallbackNotice(reason: AskFallbackReason, lang: Lang = DEFAULT_LANG): string {
  return t(lang, "ask.fallback", { reason: t(lang, `ask.fb.${reason}`) });
}

export const ASK_SUGGESTION_KEYS = ["ask.suggest1", "ask.suggest2", "ask.suggest3"] as const;

export function askSuggestions(lang: Lang = DEFAULT_LANG): string[] {
  return ASK_SUGGESTION_KEYS.map((key) => t(lang, key));
}

export const ASK_SUGGESTIONS = askSuggestions("en");

// ---------------------------------------------------------------- constraints

export function salesOf(c: AskConstraints): SalesType[] {
  return c.salesTypes?.length ? c.salesTypes : DEFAULT_ASK_SALES;
}

/** "guro digital" → "Guro Digital"; Hangul and mixed names pass through. */
export function displayPlace(name: string, lang: Lang = DEFAULT_LANG): string {
  return placeDisplayName(name, lang);
}

function formatRadius(radiusM: number): string {
  return radiusM >= 1000
    ? `${(radiusM / 1000).toFixed(radiusM % 1000 ? 1 : 0)} km`
    : `${Math.round(radiusM)} m`;
}

export type AskChip = { key: string; label: string };

/** Display text for a stored preference (canonical English words) in the UI language. */
export function preferenceText(pref: string, lang: Lang = DEFAULT_LANG): string {
  if (lang === "en") return pref;
  const key = preferenceKey(pref);
  return key && key in PREFERENCE_LABEL ? t(lang, `pref.${key}` as MessageKey) : pref;
}

/** Everything the search actually applies, as removable chips. */
export function constraintChips(c: AskConstraints, lang: Lang = DEFAULT_LANG): AskChip[] {
  const chips: AskChip[] = [];
  if (c.place && c.place.kind === "place") {
    chips.push({
      key: "place",
      label: t(lang, "ask.chip.near", {
        place: displayPlace(c.place.name, lang),
        radius: formatRadius(c.place.radiusM),
      }),
    });
  }
  if (c.propertyTypes?.length && c.propertyTypes.length < ALL_PROPERTY_TYPES.length) {
    chips.push({ key: "types", label: c.propertyTypes.map((type) => propertyTypeText(lang, type)).join(" / ") });
  }
  if (c.salesTypes?.length && !(c.salesTypes.length === 2 && DEFAULT_ASK_SALES.every((s) => c.salesTypes!.includes(s)))) {
    chips.push({ key: "sales", label: c.salesTypes.map((type) => salesTypeText(lang, type)).join(" / ") });
  }
  const money = (manwon: number | undefined) => formatKrwFromManwon(manwon, lang) ?? "";
  if (c.minDeposit != null) chips.push({ key: "minDeposit", label: t(lang, "ask.chip.depositMin", { v: money(c.minDeposit) }) });
  if (c.maxDeposit != null) chips.push({ key: "maxDeposit", label: t(lang, "ask.chip.depositMax", { v: money(c.maxDeposit) }) });
  if (c.minRent != null) chips.push({ key: "minRent", label: t(lang, "ask.chip.rentMin", { v: money(c.minRent) }) });
  if (c.maxRent != null) chips.push({ key: "maxRent", label: t(lang, "ask.chip.rentMax", { v: money(c.maxRent) }) });
  if (c.areaBucketIds?.length && c.areaBucketIds.length < areaBuckets.length) {
    chips.push({
      key: "size",
      label: areaBuckets
        .filter((b) => c.areaBucketIds!.includes(b.id))
        .map((b) => areaBucketHint(lang, b.id))
        .join(t(lang, "ask.chip.or")),
    });
  }
  if (c.rooms) chips.push({ key: "rooms", label: roomsLabel(c.rooms, lang) });
  if (c.floorFilter) chips.push({ key: "floor", label: floorFilterText(lang, c.floorFilter) });
  const built = describeBuildingAgeFilter(c.maxBuildingAge, lang);
  if (built) chips.push({ key: "builtAge", label: built });
  if (c.ageFilter) {
    const when = ageFilterText(lang, c.ageFilter);
    chips.push({ key: "listed", label: t(lang, "ask.chip.listed", { when: lang === "en" ? when.toLowerCase() : when }) });
  }
  if (c.foreignerOk) chips.push({ key: "foreigner", label: t(lang, "ask.chip.foreigner") });
  if (c.hasPhotos) chips.push({ key: "photos", label: t(lang, "ask.chip.photos") });
  if (c.commute) {
    chips.push({
      key: "commute",
      label: t(lang, "ask.chip.commute", { min: c.commute.maxMin, dest: displayPlace(c.commute.name, lang) }),
    });
  }
  if (c.similarTo) {
    chips.push({ key: "similar", label: t(lang, "ask.chip.similar", { label: displayPlace(c.similarTo.label, lang) }) });
  }
  for (const pref of c.preferences ?? []) {
    chips.push({ key: `pref:${pref}`, label: t(lang, "ask.chip.prefer", { pref: preferenceText(pref, lang) }) });
  }
  return chips;
}

/** What "Apply as filters" really puts on the map, and what it can't (soft wishes, room count). */
export function describeAppliedFilters(c: AskConstraints, lang: Lang = DEFAULT_LANG): string {
  const chips = constraintChips(c, lang);
  const notMapped = (key: string) => key.startsWith("pref:") || ["rooms", "commute", "similar"].includes(key);
  const mapped = chips.filter((chip) => !notMapped(chip.key)).map((chip) => chip.label);
  const skipped = chips.some((chip) => notMapped(chip.key));
  const base = mapped.length
    ? t(lang, "ask.filtersAppliedList", { list: mapped.join(", ") })
    : t(lang, "ask.filtersApplied");
  return skipped ? t(lang, "ask.filtersAppliedSkipped", { base }) : base;
}

export function removeConstraint(c: AskConstraints, key: string): AskConstraints {
  const next: AskConstraints = { ...c };
  switch (key) {
    case "place": delete next.place; break;
    case "types": delete next.propertyTypes; break;
    case "sales": delete next.salesTypes; break;
    case "minDeposit": case "maxDeposit": case "minRent": case "maxRent": delete next[key]; break;
    case "size": delete next.areaBucketIds; break;
    case "rooms": delete next.rooms; break;
    case "floor": delete next.floorFilter; break;
    case "builtAge": delete next.maxBuildingAge; break;
    case "listed": delete next.ageFilter; break;
    case "foreigner": delete next.foreignerOk; break;
    case "photos": delete next.hasPhotos; break;
    case "commute": delete next.commute; break;
    case "similar": delete next.similarTo; break;
    default:
      if (key.startsWith("pref:")) {
        const rest = (c.preferences ?? []).filter((p) => `pref:${p}` !== key);
        if (rest.length) next.preferences = rest;
        else delete next.preferences;
      }
  }
  return next;
}

/** Apply a one-click suggestion from the empty state. */
export function applySuggestion(c: AskConstraints, action: AskSuggestion["action"]): AskConstraints {
  if (action.type === "remove") return removeConstraint(c, action.key);
  if (action.type === "widen_radius") {
    return c.place ? { ...c, place: { ...c.place, radiusM: Math.min(3000, Math.round((c.place.radiusM * 1.8) / 100) * 100) } } : c;
  }
  const scale = (value: number | undefined) =>
    value == null ? undefined : Math.round((value * 1.3) / 5) * 5;
  const next: AskConstraints = { ...c };
  const maxRent = scale(c.maxRent);
  const maxDeposit = scale(c.maxDeposit);
  if (maxRent != null) next.maxRent = maxRent;
  if (maxDeposit != null) next.maxDeposit = maxDeposit;
  return next;
}

export function emptySuggestions(c: AskConstraints, lang: Lang = DEFAULT_LANG): AskSuggestion[] {
  const out: AskSuggestion[] = [];
  if (c.maxRent != null || c.maxDeposit != null) {
    out.push({ label: t(lang, "ask.sug.budget"), action: { type: "widen_budget" } });
  }
  if (c.place && c.place.radiusM < 3000) {
    out.push({ label: t(lang, "ask.sug.radius"), action: { type: "widen_radius" } });
  }
  const droppable: Array<[string, MessageKey, boolean]> = [
    ["builtAge", "ask.sug.builtAge", c.maxBuildingAge != null],
    ["rooms", "ask.sug.rooms", Boolean(c.rooms)],
    ["floor", "ask.sug.floor", Boolean(c.floorFilter)],
    ["size", "ask.sug.size", Boolean(c.areaBucketIds?.length)],
    ["foreigner", "ask.sug.foreigner", Boolean(c.foreignerOk)],
    ["types", "ask.sug.types", Boolean(c.propertyTypes?.length && c.propertyTypes.length < 4)],
    ["listed", "ask.sug.listed", Boolean(c.ageFilter)],
    ["photos", "ask.sug.photos", Boolean(c.hasPhotos)],
  ];
  for (const [key, label, active] of droppable) {
    if (active) out.push({ label: t(lang, label), action: { type: "remove", key } });
  }
  return out.slice(0, 4);
}

/** Server validation of constraints that came back from the client. */
export function sanitizeConstraints(raw: AskConstraints): AskConstraints {
  const price = normalizePriceFilter(raw);
  const next: AskConstraints = { ...price };
  if (raw.place) {
    next.place = {
      ...raw.place,
      name: raw.place.name.slice(0, 60),
      radiusM: Math.min(raw.commute ? MAX_COMMUTE_RADIUS_M : 3000, Math.max(250, raw.place.radiusM)),
    };
  }
  if (
    raw.commute &&
    Number.isFinite(raw.commute.lat) &&
    Number.isFinite(raw.commute.lng) &&
    raw.commute.maxMin >= 5 &&
    raw.commute.maxMin <= 90
  ) {
    next.commute = {
      name: raw.commute.name.slice(0, 60),
      lat: raw.commute.lat,
      lng: raw.commute.lng,
      maxMin: Math.round(raw.commute.maxMin),
    };
  }
  if (raw.similarTo?.id) {
    next.similarTo = { id: raw.similarTo.id.slice(0, 120), label: raw.similarTo.label.slice(0, 60) };
  }
  if (raw.propertyTypes?.length) next.propertyTypes = raw.propertyTypes;
  if (raw.salesTypes?.length) next.salesTypes = raw.salesTypes;
  if (raw.areaBucketIds?.length) next.areaBucketIds = raw.areaBucketIds;
  if (raw.rooms && raw.rooms >= 2 && raw.rooms <= 4) next.rooms = Math.round(raw.rooms);
  if (raw.floorFilter) next.floorFilter = raw.floorFilter;
  if (raw.ageFilter) next.ageFilter = raw.ageFilter;
  if (raw.maxBuildingAge) next.maxBuildingAge = raw.maxBuildingAge;
  if (raw.foreignerOk) next.foreignerOk = true;
  if (raw.hasPhotos) next.hasPhotos = true;
  const prefs = [...new Set((raw.preferences ?? []).map((p) => p.trim().slice(0, 40)).filter(Boolean))].slice(0, 5);
  if (prefs.length) next.preferences = prefs;
  return next;
}

// ---------------------------------------------------------------- preferences

type Rich = MapListing & Partial<ListingDetail>;

const PREFERENCE_KEYWORDS: Record<string, RegExp> = {
  quiet: /\b(quiet|calm|peaceful)\b|조용|한적/i,
  subway: /\b(subway|metro|transit)\b|지하철|역세권|close to (?:the )?station|near (?:a |the )?station\b/i,
  elevator: /\belevators?\b|엘리베이터|엘베/i,
  pet: /\b(pets?|pet-friendly|dogs?|cats?)\b|반려|애완/i,
  furnished: /\b(furnished|full[- ]option)\b|풀옵션/i,
  parking: /\bparking\b|주차/i,
  sunny: /\b(sunny|bright|south[- ]facing|natural light)\b|남향|채광|햇빛/i,
  newer: /\b(newer|newest|new(?:ly)?[- ]built|new building|modern)\b|신축/i,
  cheap: /\b(cheap(?:er|est)?|affordable|budget|low[- ]cost|inexpensive)\b|저렴|싼|가성비/i,
  spacious: /\b(spacious|roomy|big|bigger|large|larger)\b|넓/i,
};

/** Soft wishes the text states, in canonical words. */
export function detectPreferences(text: string): string[] {
  return Object.entries(PREFERENCE_KEYWORDS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([key]) => key);
}

export function preferenceKey(pref: string): string | undefined {
  const lower = pref.toLowerCase();
  if (lower in PREFERENCE_KEYWORDS) return lower;
  return Object.entries(PREFERENCE_KEYWORDS).find(([, pattern]) => pattern.test(lower))?.[0];
}

/** Facts about a listing that preferences and the AI can lean on. Only what the data states. */
export function listingTags(listing: MapListing): string[] {
  const l = listing as Rich;
  const tags: string[] = [];
  if (l.elevator === true) tags.push("elevator");
  const station = l.nearby?.find((n) => /지하철|subway/i.test(n.type));
  if (station?.walkMinutes != null && station.walkMinutes <= 8) tags.push("subway");
  if (l.parking && /가능|available|possible/i.test(l.parking) && !/불가|없/.test(l.parking)) tags.push("parking");
  if ((l.options?.length ?? 0) >= 6) tags.push("furnished");
  const text = `${l.title ?? ""} ${l.description ?? ""}`;
  if (/조용|한적|\bquiet\b/i.test(text)) tags.push("quiet");
  if (/(반려|애완)/.test(text) && !/(반려|애완)[^\n.,]{0,10}(불가|금지|x\b|X\b|안)/.test(text)) tags.push("pet");
  const year = builtYear(l);
  if (year != null && new Date().getFullYear() - year <= 10) tags.push("newer");
  if (l.areaM2 != null && l.areaM2 >= 33) tags.push("spacious");
  if (/남향|채광|\bsunny\b/i.test(text) || (l.direction && /^(S|SE|SW)$/i.test(l.direction))) tags.push("sunny");
  return tags;
}

export function subwayWalkMinutes(listing: MapListing): number | undefined {
  return (listing as Rich).nearby?.find((n) => /지하철|subway/i.test(n.type))?.walkMinutes;
}

// ----------------------------------------------------------------- hard filter

function usable(listing: MapListing): boolean {
  return (
    !isNaverClusterListing(listing) &&
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng)
  );
}

export function searchCircle(c: AskConstraints, radiusM?: number) {
  const place = c.place ?? { ...SEOUL_CENTER, radiusM: 1500 };
  return { lat: place.lat, lng: place.lng, radiusM: radiusM ?? place.radiusM };
}

export type HardFilterResult = { listings: MapListing[]; relaxed: boolean };

/**
 * Keep only listings that satisfy every stated constraint. Listings that do
 * not state an optional attribute (floor, building age, size…) are dropped
 * first; when that leaves too few, they are admitted back (price and deal
 * type stay strict) and `relaxed` says so.
 */
function applyRooms(listings: MapListing[], rooms: number | undefined, minWanted: number): MapListing[] {
  if (!rooms) return listings;
  const known = listings.filter((l) => listingRooms(l) === rooms);
  if (known.length >= minWanted) return known;
  // Not enough that state it: keep the ones that say nothing, never the ones that say otherwise.
  return [...known, ...listings.filter((l) => listingRooms(l) === undefined)];
}

export function hardFilterCandidates(
  listings: MapListing[],
  c: AskConstraints,
  radiusM?: number,
  minWanted = ASK_PICK_COUNT,
): HardFilterResult {
  const base = hardFilterStep(listings, c, radiusM, minWanted);
  if (!c.rooms) return base;
  return { ...base, listings: applyRooms(base.listings, c.rooms, minWanted) };
}

function hardFilterStep(
  listings: MapListing[],
  c: AskConstraints,
  radiusM?: number,
  minWanted = ASK_PICK_COUNT,
): HardFilterResult {
  const circle = searchCircle(c, radiusM);
  const seen = new Set<string>();
  const pool = listings.filter((l) => {
    if (!usable(l) || seen.has(l.id)) return false;
    if (c.similarTo && l.id === c.similarTo.id) return false;
    seen.add(l.id);
    if (c.commute && distanceM(l, c.commute) > commuteRadiusM(c.commute.maxMin)) return false;
    return pointInCircle(l, circle);
  });
  const input = {
    propertyTypes: c.propertyTypes ?? [],
    salesTypes: salesOf(c),
    areaBucketIds: c.areaBucketIds ?? [],
    query: "",
    minDeposit: c.minDeposit,
    maxDeposit: c.maxDeposit,
    minRent: c.minRent,
    maxRent: c.maxRent,
    foreignerOk: c.foreignerOk,
    hasPhotos: c.hasPhotos,
    floorFilter: c.floorFilter,
    ageFilter: c.ageFilter,
    maxBuildingAge: c.maxBuildingAge,
  };
  const strict = filterListings(pool, { ...input, requireDetails: true });
  if (strict.length >= minWanted) return { listings: strict, relaxed: false };
  const hasOptional = [
    (c.areaBucketIds?.length ?? 0) > 0,
    c.floorFilter !== undefined,
    c.maxBuildingAge !== undefined,
    c.ageFilter !== undefined,
    c.foreignerOk === true,
    c.hasPhotos === true,
  ].some(Boolean);
  if (!hasOptional) return { listings: strict, relaxed: false };
  const strictIds = new Set(strict.map((l) => l.id));
  const loose = filterListings(pool, { ...input, requireDetails: false }).filter(
    (l) => l.salesType && (l.deposit != null || l.price != null) && !strictIds.has(l.id),
  );
  // Strict matches always rank ahead of "unknown" ones.
  return { listings: [...strict, ...loose], relaxed: loose.length > 0 };
}

// ------------------------------------------------------------- fallback scoring

export type ScoredCandidate = {
  listing: MapListing;
  commuteMin?: number;
  score: number;
  distanceM: number;
  reason: string;
};

const NEW_WORDS = /\b(new|newer|newest|modern|recent(?:ly built)?)\b|신축|새건물/i;
const BIG_WORDS = /\b(big|bigger|large|larger|spacious|roomy|wide)\b|넓/i;
const CLOSE_WORDS = /\b(close|closest|nearest|walking distance|walkable|center)\b|가까|도보/i;

function percentile(sortedAsc: number[], value: number): number {
  if (sortedAsc.length < 2) return 0.5;
  let below = 0;
  for (const v of sortedAsc) if (v < value) below += 1;
  return below / (sortedAsc.length - 1);
}

function photoCount(l: MapListing): number {
  const n = new Set([...(l.photos ?? []), ...(l.thumbnail ? [l.thumbnail] : [])]).size;
  return n;
}

export function builtYear(l: MapListing): number | undefined {
  const digits = (l.approveDate ?? "").replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  const y = Number(digits.slice(0, 4));
  return y >= 1900 && y <= 2100 ? y : undefined;
}

/** Stable small hash so phrasing varies between cards but not between runs. */
function pickVariant(id: string, n: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % n;
}

function genericReason(
  l: MapListing,
  parts: { price: number; dist: number; age: number; size: number; photos: number; prefs: number },
  c: AskConstraints,
  dist: number,
  prefHits: string[],
  lang: Lang = DEFAULT_LANG,
): string {
  const v = (n: number) => pickVariant(l.id, n);
  const phrases: Array<[number, string]> = [];
  const money = formatKrwFromManwon(l.salesType === "jeonse" ? l.deposit : l.rent, lang);
  const pick = (base: string, n: number, params: Record<string, string | number>) =>
    t(lang, `${base}${v(n) + 1}` as MessageKey, params);
  if (money && parts.price >= 0.6) {
    phrases.push([parts.price, pick(l.salesType === "jeonse" ? "ask.r.jeonseLow" : "ask.r.rentLow", 3, { money })]);
  }
  const where = c.place?.kind === "place" ? displayPlace(c.place.name, lang) : t(lang, "ask.r.center");
  const meters = Math.round(dist / 10) * 10;
  if (parts.dist >= 0.5) {
    phrases.push([parts.dist * 0.9, pick("ask.r.near", 3, { m: meters, where })]);
  }
  const year = builtYear(l);
  if (year && parts.age >= 0.6) phrases.push([parts.age * 0.8, pick("ask.r.built", 2, { year })]);
  const size = sizeClass(l.areaM2);
  if (l.areaM2 && parts.size >= 0.5 && size) {
    const sizeWord = t(lang, size === "very large" ? "size.veryLarge" : (`size.${size}` as MessageKey));
    phrases.push([
      parts.size * 0.7,
      v(2) === 0
        ? t(lang, "ask.r.size1", { m2: l.areaM2, py: toPyeong(l.areaM2).toFixed(1) })
        : t(lang, "ask.r.size2", {
            size: lang === "en" ? `${sizeWord[0]!.toUpperCase()}${sizeWord.slice(1)}` : sizeWord,
            m2: l.areaM2,
          }),
    ]);
  }
  for (const hit of prefHits) {
    const built = builtYear(l);
    phrases.push([
      1,
      hit === "subway"
        ? t(lang, "ask.r.subway", { min: subwayWalkMinutes(l) ?? t(lang, "ask.r.subwayFew") })
        : hit === "elevator"
          ? t(lang, "ask.r.elevator")
          : hit === "quiet"
            ? t(lang, "ask.r.quiet")
            : hit === "cheap"
              ? t(lang, v(2) === 0 ? "ask.r.cheap1" : "ask.r.cheap2")
              : hit === "newer"
                ? t(lang, "ask.r.newer", { year: built ? ` (${built})` : "" })
                : hit === "spacious"
                  ? t(lang, "ask.r.roomy", { m2: l.areaM2 ?? "" })
                  : hit === "pet"
                    ? t(lang, "ask.r.pet")
                    : hit === "parking"
                      ? t(lang, "ask.r.parking")
                      : hit === "furnished"
                        ? t(lang, "ask.r.furnished")
                        : hit === "sunny"
                          ? t(lang, "ask.r.sunny")
                          : t(lang, "ask.r.matches", { hit }),
    ]);
  }
  const photos = photoCount(l);
  if (photos >= 4) phrases.push([parts.photos * 0.5, t(lang, "ask.r.photos", { n: photos })]);
  phrases.sort((a, b) => b[0] - a[0]);
  const top = phrases.slice(0, 3).map(([, text]) => text);
  if (!top.length) return t(lang, "ask.r.fits", { m: meters, where });
  return top.join(" · ");
}

/**
 * Does the listing plausibly have the requested room count? "mismatch" = it
 * says it is a one-room/open studio, or (when it states nothing) is far too
 * small for two rooms; those only fill leftover slots.
 */
export function roomMatch(l: MapListing, rooms: number): "match" | "mismatch" | "unknown" {
  const stated = listingRooms(l);
  if (stated != null) return stated === rooms ? "match" : stated < rooms ? "mismatch" : "unknown";
  if (rooms >= 2 && l.areaM2 != null && l.areaM2 < 25) return "mismatch";
  return "unknown";
}

/** Messages the user typed mention these → don't penalise basement / rooftop units. */
export function asksForBasementOrRooftop(text: string): boolean {
  return BASEMENT_OR_ROOFTOP_WORDS.test(text);
}

/**
 * Score every candidate 0..1 without AI. `requestText` is only the latest user
 * message; stated wishes also arrive as `preferences`, so removing a chip changes ranking.
 */
export function fallbackRank(
  candidates: MapListing[],
  c: AskConstraints,
  center: { lat: number; lng: number },
  radiusM: number,
  requestText = "",
  now = new Date(),
  lang: Lang = DEFAULT_LANG,
): ScoredCandidate[] {
  if (!candidates.length) return [];
  const prefKeys = (c.preferences ?? []).map(preferenceKey).filter((k): k is string => Boolean(k));
  const cheap = prefKeys.includes("cheap") || CHEAP_WORDS.test(requestText);
  const wantsNew = prefKeys.includes("newer") || NEW_WORDS.test(requestText);
  const wantsBig = prefKeys.includes("spacious") || BIG_WORDS.test(requestText);
  const allowsBasement = asksForBasementOrRooftop(requestText);
  const deposits = candidates
    .map((l) => (l.salesType === "sale" ? undefined : l.deposit))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const effective = candidates
    .map((l) => effectiveMonthlyManwon(l))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const weights = {
    price: cheap ? 0.5 : 0.3,
    dist: c.commute ? 0.4 : CLOSE_WORDS.test(requestText) ? 0.35 : 0.25,
    age: wantsNew ? 0.3 : 0.15,
    size: wantsBig ? 0.25 : 0.1,
    photos: 0.1,
    prefs: prefKeys.filter((k) => k !== "cheap" && k !== "newer" && k !== "spacious").length ? 0.2 : 0,
  };
  const scoringPrefs = prefKeys.filter((k) => k !== "cheap" && k !== "newer" && k !== "spacious");
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const scored = candidates.map((l) => {
    const cost = effectiveMonthlyManwon(l);
    const dist = distanceM(l, c.commute ?? center);
    const commuteMin = c.commute ? approxCommuteMin(distanceM(l, c.commute)) : undefined;
    const age = buildingAgeYears(l.approveDate, now);
    const tags = listingTags(l);
    const hits = prefKeys.filter((k) => tags.includes(k) || (k === "cheap" && cost != null && percentile(effective, cost) < 0.35));
    const parts = {
      price:
        cost == null
          ? 0.3
          : cheap && l.deposit != null && l.salesType === "wolse"
            ? // "Cheap" is low monthly total AND low money up front.
              0.6 * (1 - percentile(effective, cost)) + 0.4 * (1 - percentile(deposits, l.deposit))
            : 1 - percentile(effective, cost),
      dist: Math.max(
        0,
        1 - dist / Math.max(c.commute ? Math.min(radiusM, commuteRadiusM(c.commute.maxMin)) : radiusM, 1),
      ),
      age: age == null ? 0.4 : Math.max(0, 1 - Math.min(Math.max(age, 0), 30) / 30),
      size: l.areaM2 == null ? 0.3 : Math.min(1, l.areaM2 / 40),
      photos: Math.min(photoCount(l), 6) / 6,
      prefs: scoringPrefs.length ? scoringPrefs.filter((k) => tags.includes(k)).length / scoringPrefs.length : 0,
    };
    let score =
      (parts.price * weights.price +
        parts.dist * weights.dist +
        parts.age * weights.age +
        parts.size * weights.size +
        parts.photos * weights.photos +
        parts.prefs * weights.prefs) /
      total;
    const kind = floorKind(l.floor);
    if (c.rooms) score += roomMatch(l, c.rooms) === "match" ? 0.12 : roomMatch(l, c.rooms) === "mismatch" ? -1 : -0.04;
    if (kind !== "normal" && !allowsBasement && !c.floorFilter) score -= cheap ? 0.1 : 0.5;
    // Listings with a photo win ties; a card with a placeholder is a weaker pick.
    score += hasAnyPhoto(l) ? 0.02 : -0.02;
    return { listing: l, score, distanceM: dist, ...(commuteMin != null ? { commuteMin } : {}), reason: genericReason(l, parts, c, dist, hits.filter((h) => h !== "newer" && h !== "spacious" || tags.includes(h)), lang) };
  });
  return scored.sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id));
}

/** Collapse repeats, then cap near-duplicates, keeping the score order. */
export type DuplicateInfo = {
  /** listing id → id of its near-duplicate group */
  groups: ReadonlyMap<string, string>;
  /** group id → how many listings it had before collapsing */
  groupSize: ReadonlyMap<string, number>;
};

export function prepareRanked(ranked: ScoredCandidate[]): { ranked: ScoredCandidate[] } & DuplicateInfo {
  const { items, groups, groupSize } = collapseDuplicates(ranked);
  return { ranked: diversify(items, groups, MAX_NEAR_DUPLICATES), groups, groupSize };
}

// ---------------------------------------------------------------- AI summaries

/**
 * What the AI sees per candidate. Fields the listing doesn't have are simply
 * absent (never null/"unknown") so the model has nothing to invent from.
 */
export type CompactCandidate = {
  id: string;
  type: string;
  deal: string;
  /** Ready-made price line in the answer language (deal type + amounts). Quote it as-is. */
  price: string;
  /** Pre-formatted KRW, e.g. "₩80 million". Quote these as-is. */
  deposit?: string;
  monthlyRent?: string;
  maintenanceFee?: string;
  salePrice?: string;
  /** Rent + deposit×5%/12 in KRW; the number to compare when "cheap" matters. */
  effectiveMonthly?: string;
  m2?: number;
  /** tiny <15 m², small <23, medium <33, large <50, very large. */
  size?: string;
  /** English floor label, e.g. "Floor 9 of 21", "Semi-basement", "Rooftop". */
  floor?: string;
  rooms?: number;
  builtYear?: number;
  /** Only present when true for this listing against the other candidates: the deposit is below their median. */
  depositBelowMedian?: boolean;
  /** Straight-line distance from the search center (not from a subway). */
  metersFromCenter: number;
  subwayWalkMin?: number;
  /** Approximate door-to-door minutes to the user's commute destination (rough estimate). */
  commuteMinApprox?: number;
  hasPhoto: boolean;
  facts?: string[];
  title?: string;
  area?: string;
};

export function compactCandidate(
  listing: MapListing,
  center: { lat: number; lng: number },
  lang: Lang = DEFAULT_LANG,
  commute?: AskCommute,
  ctx: ReasonContext = {},
): CompactCandidate {
  const year = builtYear(listing);
  const tags = listingTags(listing);
  const effective = effectiveMonthlyManwon(listing);
  const out: CompactCandidate = {
    id: listing.id,
    type: propertyTypeText(lang, listing.propertyType).toLowerCase(),
    deal: listing.salesType ?? "unknown",
    price: priceText(listing, lang),
    depositBelowMedian:
      listing.salesType !== "sale" && listing.deposit != null && ctx.medianDeposit != null && listing.deposit < ctx.medianDeposit
        ? true
        : undefined,
    deposit: listing.salesType === "sale" ? undefined : (formatKrwFromManwon(listing.deposit, lang) ?? undefined),
    monthlyRent:
      listing.salesType === "wolse" && listing.rent != null ? (formatKrwFromManwon(listing.rent, lang) ?? undefined) : undefined,
    maintenanceFee: listing.manageCost ? (formatKrwFromManwon(listing.manageCost, lang) ?? undefined) : undefined,
    salePrice: listing.salesType === "sale" ? (formatKrwFromManwon(listing.price, lang) ?? undefined) : undefined,
    effectiveMonthly: effective != null && listing.salesType === "wolse" ? (formatKrwFromManwon(Math.round(effective * 10) / 10, lang) ?? undefined) : undefined,
    m2: listing.areaM2,
    size: sizeClass(listing.areaM2),
    floor: formatFloor(listing.floor, lang) ?? undefined,
    rooms: listingRooms(listing),
    builtYear: year,
    metersFromCenter: Math.round(distanceM(listing, center) / 10) * 10,
    subwayWalkMin: subwayWalkMinutes(listing),
    commuteMinApprox: commute ? approxCommuteMin(distanceM(listing, commute)) : undefined,
    hasPhoto: hasAnyPhoto(listing),
    facts: tags.length ? tags.filter((t) => t !== "spacious" && t !== "newer") : undefined,
    title: listing.title?.replace(/\s+/g, " ").slice(0, 40),
    area: areaLabel(listing, lang) ?? undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as CompactCandidate;
}

function cleanLine(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
   
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export type ValidatedAiRanking = {
  picks: Array<{ id: string; reason?: string }>;
  summary?: string;
  assumptions: string[];
  dropped: number;
};

/** Keep only picks whose id is a real candidate; drop invented and duplicate ids. */
export function validateAiRanking(
  raw: unknown,
  candidateIds: ReadonlySet<string>,
  max = ASK_PICK_COUNT,
): ValidatedAiRanking {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(data.picks) ? (data.picks as unknown[]) : [];
  const picks: ValidatedAiRanking["picks"] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of list) {
    const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || !candidateIds.has(id) || seen.has(id)) {
      dropped += 1;
      continue;
    }
    if (picks.length >= max) continue;
    seen.add(id);
    picks.push({ id, reason: cleanLine(entry.reason, 150) });
  }
  const assumptions = (Array.isArray(data.assumptions) ? (data.assumptions as unknown[]) : [])
    .map((a) => cleanLine(a, 140))
    .filter((a): a is string => Boolean(a))
    .slice(0, 4);
  return { picks, summary: cleanLine(data.summary, 300), assumptions, dropped };
}

export function groundedReason(reason: string | undefined, listing: MapListing, ctx: ReasonContext = {}): string | undefined {
  if (!reason) return undefined;
  // Price wording must agree with the structured deal type and amounts.
  if (!reasonPriceConsistent(reason, listing, ctx)) return undefined;
  const tags = listingTags(listing);
  const ok = reasonIsGrounded(reason, {
    builtYear: builtYear(listing),
    subwayWalkMin: subwayWalkMinutes(listing),
    tags,
    floor: listing.floor,
    m2: listing.areaM2,
  });
  return ok ? reason : undefined;
}

/**
 * Merge AI picks with the deterministic ranking so the carousel is always full.
 * AI reasons that state facts the listing lacks are replaced by the basic
 * reason, and no more than MAX_NEAR_DUPLICATES of one complex/price/size make it.
 */
export function assemblePicks(
  ai: ValidatedAiRanking | null,
  ranked: ScoredCandidate[],
  target = ASK_PICK_COUNT,
  dupes: Partial<DuplicateInfo> & {
    /** Semi-basement / rooftop AI picks only count when nothing else is left. */
    avoidBadFloors?: boolean;
    /** Ignore the model's order and keep our score order (cheap requests). */
    orderByScore?: boolean;
    /** Median deposit of the candidate set: the only yardstick for calling a deposit "low". */
    medianDeposit?: number;
    /** Listings that do not really match a stated room count; they only fill leftover slots. */
    weakIds?: ReadonlySet<string>;
  } = {},
): AskPick[] {
  const groups = dupes.groups ?? new Map<string, string>();
  const groupOf = (l: MapListing) => groups.get(l.id) ?? l.id;
  const byId = new Map(ranked.map((r) => [r.listing.id, r]));
  const out: AskPick[] = [];
  const used = new Set<string>();
  const perGroup = new Map<string, number>();
  const take = (item: ScoredCandidate, reason?: string) => {
    const key = groupOf(item.listing);
    perGroup.set(key, (perGroup.get(key) ?? 0) + 1);
    used.add(item.listing.id);
    out.push({
      rank: out.length + 1,
      listing: item.listing,
      reason: reason ?? item.reason,
      reasonSource: reason ? "ai" : "basic",
      distanceM: Math.round(item.distanceM),
      facts: { tags: listingTags(item.listing), ...(subwayWalkMinutes(item.listing) != null ? { subwayWalkMin: subwayWalkMinutes(item.listing)! } : {}) },
      ...(item.commuteMin != null ? { commuteMin: item.commuteMin } : {}),
    });
  };
  const roomFor = (item: ScoredCandidate) => (perGroup.get(groupOf(item.listing)) ?? 0) < MAX_NEAR_DUPLICATES;
  const rankIndex = new Map(ranked.map((r, index) => [r.listing.id, index]));
  const aiPicks = [...(ai?.picks ?? [])];
  if (dupes.orderByScore) aiPicks.sort((a, b) => (rankIndex.get(a.id) ?? 1e9) - (rankIndex.get(b.id) ?? 1e9));
  const weak = (item: ScoredCandidate) =>
    (dupes.avoidBadFloors && floorKind(item.listing.floor) !== "normal") || Boolean(dupes.weakIds?.has(item.listing.id));
  const deferred: Array<{ item: ScoredCandidate; reason?: string }> = [];
  for (const pick of aiPicks) {
    const found = byId.get(pick.id);
    if (!found || used.has(pick.id) || !roomFor(found)) continue;
    const reason = groundedReason(pick.reason, found.listing, { medianDeposit: dupes.medianDeposit });
    if (weak(found)) {
      deferred.push({ item: found, reason });
      continue;
    }
    take(found, reason);
  }
  for (const item of ranked) {
    if (out.length >= target) break;
    if (used.has(item.listing.id) || !roomFor(item)) continue;
    take(item);
  }
  // Deferred basement/rooftop picks only when nothing better is left.
  for (const { item, reason } of deferred) {
    if (out.length >= target) break;
    if (!used.has(item.listing.id) && roomFor(item)) take(item, reason);
  }
  // Short of picks because of the cap: fill from what is left rather than show fewer.
  for (const item of ranked) {
    if (out.length >= target) break;
    if (!used.has(item.listing.id)) take(item);
  }
  const noted = new Set<string>();
  for (const pick of out) {
    const key = groupOf(pick.listing);
    if (noted.has(key)) continue;
    noted.add(key);
    const extra = (dupes.groupSize?.get(key) ?? 0) - (perGroup.get(key) ?? 0);
    if (extra > 0) pick.similar = extra;
  }
  return out.slice(0, target).map((pick, index) => ({ ...pick, rank: index + 1 }));
}

export function basicSummary(picks: MapListing[], candidates: number, c: AskConstraints, lang: Lang): string {
  const placeName = c.place?.kind === "place" ? displayPlace(c.place.name, lang) : undefined;
  const typeWord =
    c.propertyTypes?.length === 1
      ? propertyTypeText(lang, c.propertyTypes[0]!).toLowerCase()
      : t(lang, "ask.sum.home");
  return buildAskSummary({
    lang,
    count: picks.length,
    candidates,
    placeName,
    typeWord,
    deals: salesOf(c),
    rooms: c.rooms,
    picks,
    cheap: (c.preferences ?? []).some((p) => preferenceKey(p) === "cheap"),
  });
}

/**
 * Deterministic language switch of a stored result: same constraints, picks,
 * order and counts; summary, notes and "basic" reasons are rewritten from the
 * structured data. Instant and offline, so the UI never shows the old language.
 */
export function localizeBasic(
  result: Extract<AskPicksResult, { status: "ok" | "empty" }>,
  from: Lang,
  lang: Lang,
): Extract<AskPicksResult, { status: "ok" | "empty" }> {
  if (from === lang) return result;
  const c = sanitizeConstraints(result.constraints);
  const notes = result.assumptions
    .map((a) => relocalizeAssumption(a, from, lang))
    .filter((a): a is string => Boolean(a));
  if (result.status === "empty") {
    return {
      ...result,
      constraints: c,
      summary: result.sourceErrors.length ? t(lang, "ask.emptyNoSource") : t(lang, "ask.emptyNone"),
      assumptions: notes,
      suggestions: emptySuggestions(c, lang),
    };
  }
  const listings = result.picks.map((p) => restoreRich(p.listing, p.facts));
  const center = searchCircle(c, result.radiusM);
  const reasons = new Map(
    fallbackRank(listings, c, center, result.radiusM, "", new Date(), lang).map((s) => [s.listing.id, s.reason]),
  );
  return {
    ...result,
    constraints: c,
    picks: result.picks.map((p) => ({ ...p, reason: reasons.get(p.listing.id) ?? p.reason, reasonSource: "basic" as const })),
    summary: basicSummary(result.picks.map((p) => p.listing), result.candidateCount, c, lang),
    assumptions: notes,
  };
}

/** Re-create the detail fields that tags/subway checks read, from the stored facts of a slimmed pick. */
export function restoreRich(listing: MapListing, facts?: AskPick["facts"]): MapListing {
  if (!facts) return listing;
  const rich: Rich = { ...listing };
  const tags = new Set(facts.tags);
  if (tags.has("elevator")) rich.elevator = true;
  if (tags.has("parking")) rich.parking = "possible";
  if (tags.has("furnished")) rich.options = Array.from({ length: 6 }, (_v, i) => `option${i}`);
  const words = [tags.has("quiet") ? "조용" : "", tags.has("pet") ? "반려동물" : "", tags.has("sunny") ? "남향" : ""].filter(Boolean);
  if (words.length) rich.description = `${rich.description ?? ""} ${words.join(" ")}`.trim();
  if (facts.subwayWalkMin != null) rich.nearby = [{ type: "subway", name: "", walkMinutes: facts.subwayWalkMin, meters: 0 } as NonNullable<Rich["nearby"]>[number]];
  return rich;
}

/** Drop the heavy detail fields before sending a listing to the browser. */
export function slimListing(listing: MapListing): MapListing {
  const l = listing as Rich;
  const photos = (l.photos ?? []).slice(0, 4);
  const slim: Rich = {
    id: l.id,
    source: l.source,
    sourceId: l.sourceId,
    lat: l.lat,
    lng: l.lng,
    propertyType: l.propertyType,
    salesType: l.salesType,
    title: l.title,
    deposit: l.deposit,
    rent: l.rent,
    price: l.price ?? undefined,
    areaM2: l.areaM2,
    floor: l.floor,
    address: l.address,
    thumbnail: l.thumbnail ?? photos[0],
    url: l.url,
    manageCost: l.manageCost,
    roomType: l.roomType,
    updatedAt: l.updatedAt,
    approveDate: l.approveDate,
    photos: photos.length ? photos : undefined,
    foreignerOk: l.foreignerOk ?? undefined,
  };
  return Object.fromEntries(Object.entries(slim).filter(([, v]) => v !== undefined && v !== null)) as MapListing;
}

export { listingHasPhotos };

// ------------------------------------------------------------------- carousel

/** Index of the slide nearest the scroll position; the last one once scrolled to the end. */
export function activeSlideIndex(scrollLeft: number, stride: number, count: number, atEnd = false): number {
  if (count <= 0 || stride <= 0) return 0;
  if (atEnd) return count - 1;
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / stride)));
}

/**
 * Slides at least 60% inside the viewport, as first..last (inclusive). With
 * one full card in view first === last ("Pick N of 10"); with several, the
 * counter reads "Showing a–b of 10".
 */
export function visibleSlideRange(
  scrollLeft: number,
  viewport: number,
  stride: number,
  count: number,
  slideWidth = stride,
): { first: number; last: number } {
  if (count <= 0 || stride <= 0 || viewport <= 0) return { first: 0, last: 0 };
  let first = -1;
  let last = -1;
  for (let i = 0; i < count; i += 1) {
    const left = i * stride - scrollLeft;
    const visible = Math.min(left + slideWidth, viewport) - Math.max(left, 0);
    if (visible >= slideWidth * 0.6) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) {
    const nearest = activeSlideIndex(scrollLeft, stride, count);
    return { first: nearest, last: nearest };
  }
  return { first, last };
}

/** Next slide index for an arrow key / button, clamped to the ends. */
export function stepSlide(index: number, delta: number, count: number): number {
  return Math.max(0, Math.min(Math.max(count - 1, 0), index + delta));
}

// ------------------------------------------------- constraints <-> map filters

export const PREFERENCE_LABEL: Record<string, string> = {
  quiet: "quiet",
  subway: "close to subway",
  elevator: "elevator",
  pet: "pet-friendly",
  furnished: "furnished",
  parking: "parking",
  sunny: "sunny",
  newer: "newer building",
  spacious: "spacious",
  cheap: "low cost",
};

export function constraintsToSnapshot(
  c: AskConstraints,
  base: Partial<Pick<SearchSnapshot, "radiusM" | "viewMode" | "searchInput">> = {},
): SearchSnapshot {
  return {
    searchInput: c.place?.kind === "place" ? c.place.name : (base.searchInput ?? ""),
    propertyTypes: c.propertyTypes?.length ? c.propertyTypes : [...ALL_PROPERTY_TYPES],
    salesTypes: salesOf(c),
    areaBucketIds: c.areaBucketIds ?? [],
    radiusM: Math.min(3000, Math.max(250, c.place?.radiusM ?? base.radiusM ?? 1200)),
    viewMode: base.viewMode ?? "map",
    minDeposit: c.minDeposit,
    maxDeposit: c.maxDeposit,
    minRent: c.minRent,
    maxRent: c.maxRent,
    foreignerOk: c.foreignerOk,
    hasPhotos: c.hasPhotos,
    floorFilter: c.floorFilter,
    ageFilter: c.ageFilter,
    maxBuildingAge: c.maxBuildingAge,
  };
}

export function snapshotToConstraints(
  s: SearchSnapshot,
  place: AskPlace | undefined,
  preferences: string[] | undefined,
): AskConstraints {
  const c: AskConstraints = {
    ...normalizePriceFilter(s),
    salesTypes: s.salesTypes.length ? s.salesTypes : undefined,
  };
  if (place) c.place = place;
  if (s.propertyTypes.length && s.propertyTypes.length < ALL_PROPERTY_TYPES.length) c.propertyTypes = s.propertyTypes;
  if (s.areaBucketIds.length && s.areaBucketIds.length < areaBuckets.length) c.areaBucketIds = s.areaBucketIds;
  if (s.floorFilter) c.floorFilter = s.floorFilter;
  if (s.ageFilter) c.ageFilter = s.ageFilter;
  if (s.maxBuildingAge) c.maxBuildingAge = s.maxBuildingAge;
  if (s.foreignerOk) c.foreignerOk = true;
  if (s.hasPhotos) c.hasPhotos = true;
  if (preferences?.length) c.preferences = preferences;
  return c;
}
