/**
 * Ask → "10 picks". Pure, shared (server + client) logic: the constraint
 * model and its chips, hard filtering, deterministic fallback scoring, and
 * validation of whatever the AI hands back.
 */
import { distanceM, pointInCircle } from "~/lib/geo/shape";
import { type SearchSnapshot } from "./ai-search";
import { ageFilterLabel, type AgeFilter } from "./age";
import { areaBuckets, toPyeong, type AreaBucketId } from "./area";
import { buildingAgeYears, describeBuildingAgeFilter } from "./building-age";
import { formatFloor, formatKrwFromManwon, propertyTypeLabel, salesTypeLabel } from "./copy";
import {
  BASEMENT_OR_ROOFTOP_WORDS,
  CHEAP_WORDS,
  collapseDuplicates,
  diversify,
  effectiveMonthlyManwon,
  floorKind,
  hasAnyPhoto,
  areaLabel,
  listingRooms,
  nearDuplicateKey,
  reasonIsGrounded,
  roomsLabel,
  sizeClass,
  MAX_NEAR_DUPLICATES,
} from "./ask-quality";
import { filterListings, isNaverClusterListing } from "./filter";
import { floorFilterLabel, type FloorFilter } from "./floor";
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
} & PriceFilter;

export type AskPick = {
  rank: number;
  listing: MapListing;
  reason: string;
  reasonSource: "ai" | "basic";
  distanceM?: number;
  /** Other listings of the same complex/price/size that were folded into or left out of this pick. */
  similar?: number;
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

const FALLBACK_WORDS: Record<AskFallbackReason, string> = {
  rate_limited: "rate limited",
  quota: "quota exhausted",
  auth: "key rejected",
  timeout: "timed out",
  error: "error",
  unconfigured: "not configured",
};

export function askFallbackNotice(reason: AskFallbackReason): string {
  return `Using basic ranking — AI unavailable (${FALLBACK_WORDS[reason]})`;
}

export const ASK_SUGGESTIONS = [
  "Cheap studio near Hongdae under ₩700,000 monthly, quiet, close to subway",
  "Jeonse villa near Guro Digital, no basement, under 15 years old",
  "Spacious officetel near Gangnam station, newer building, elevator",
];

// ---------------------------------------------------------------- constraints

export function salesOf(c: AskConstraints): SalesType[] {
  return c.salesTypes?.length ? c.salesTypes : DEFAULT_ASK_SALES;
}

/** "guro digital" → "Guro Digital"; Hangul and mixed names pass through. */
export function displayPlace(name: string): string {
  return name.replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}

function formatRadius(radiusM: number): string {
  return radiusM >= 1000 ? `${(radiusM / 1000).toFixed(radiusM % 1000 ? 1 : 0)} km` : `${Math.round(radiusM)} m`;
}

export type AskChip = { key: string; label: string };

/** Everything the search actually applies, as removable chips. */
export function constraintChips(c: AskConstraints): AskChip[] {
  const chips: AskChip[] = [];
  if (c.place && c.place.kind === "place") {
    chips.push({
      key: "place",
      label: `Near ${displayPlace(c.place.name)} · ${formatRadius(c.place.radiusM)}`,
    });
  }
  if (c.propertyTypes?.length && c.propertyTypes.length < ALL_PROPERTY_TYPES.length) {
    chips.push({ key: "types", label: c.propertyTypes.map((t) => propertyTypeLabel[t]).join(" / ") });
  }
  if (c.salesTypes?.length && !(c.salesTypes.length === 2 && DEFAULT_ASK_SALES.every((s) => c.salesTypes!.includes(s)))) {
    chips.push({ key: "sales", label: c.salesTypes.map((t) => salesTypeLabel[t]).join(" / ") });
  }
  const money = (manwon: number | undefined) => formatKrwFromManwon(manwon) ?? "";
  if (c.minDeposit != null) chips.push({ key: "minDeposit", label: `Deposit ≥ ${money(c.minDeposit)}` });
  if (c.maxDeposit != null) chips.push({ key: "maxDeposit", label: `Deposit ≤ ${money(c.maxDeposit)}` });
  if (c.minRent != null) chips.push({ key: "minRent", label: `Rent ≥ ${money(c.minRent)}` });
  if (c.maxRent != null) chips.push({ key: "maxRent", label: `Rent ≤ ${money(c.maxRent)}` });
  if (c.areaBucketIds?.length && c.areaBucketIds.length < areaBuckets.length) {
    chips.push({
      key: "size",
      label: areaBuckets
        .filter((b) => c.areaBucketIds!.includes(b.id))
        .map((b) => b.hint)
        .join(" or "),
    });
  }
  if (c.rooms) chips.push({ key: "rooms", label: roomsLabel(c.rooms) });
  if (c.floorFilter) chips.push({ key: "floor", label: floorFilterLabel[c.floorFilter] });
  const built = describeBuildingAgeFilter(c.maxBuildingAge);
  if (built) chips.push({ key: "builtAge", label: built });
  if (c.ageFilter) chips.push({ key: "listed", label: `Listed ${ageFilterLabel[c.ageFilter].toLowerCase()}` });
  if (c.foreignerOk) chips.push({ key: "foreigner", label: "Foreigner-friendly" });
  if (c.hasPhotos) chips.push({ key: "photos", label: "With photos" });
  for (const pref of c.preferences ?? []) chips.push({ key: `pref:${pref}`, label: `Prefer ${pref}` });
  return chips;
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

export function emptySuggestions(c: AskConstraints): AskSuggestion[] {
  const out: AskSuggestion[] = [];
  if (c.maxRent != null || c.maxDeposit != null) {
    out.push({ label: "Raise the budget by about 30%", action: { type: "widen_budget" } });
  }
  if (c.place && c.place.radiusM < 3000) {
    out.push({ label: "Search a wider area", action: { type: "widen_radius" } });
  }
  const droppable: Array<[string, string, boolean]> = [
    ["builtAge", "Allow older buildings", c.maxBuildingAge != null],
    ["rooms", "Ignore the room count", Boolean(c.rooms)],
    ["floor", "Drop the floor requirement", Boolean(c.floorFilter)],
    ["size", "Allow any size", Boolean(c.areaBucketIds?.length)],
    ["foreigner", "Include landlords who don't mention foreigners", Boolean(c.foreignerOk)],
    ["types", "Include every home type", Boolean(c.propertyTypes?.length && c.propertyTypes.length < 4)],
    ["listed", "Include older listings", Boolean(c.ageFilter)],
    ["photos", "Include listings without photos", Boolean(c.hasPhotos)],
  ];
  for (const [key, label, active] of droppable) {
    if (active) out.push({ label, action: { type: "remove", key } });
  }
  return out.slice(0, 4);
}

/** Server validation of constraints that came back from the client. */
export function sanitizeConstraints(raw: AskConstraints): AskConstraints {
  const price = normalizePriceFilter(raw);
  const next: AskConstraints = { ...price };
  if (raw.place) {
    next.place = { ...raw.place, name: raw.place.name.slice(0, 60), radiusM: Math.min(3000, Math.max(250, raw.place.radiusM)) };
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
    seen.add(l.id);
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
): string {
  const v = (n: number) => pickVariant(l.id, n);
  const phrases: Array<[number, string]> = [];
  const money = formatKrwFromManwon(l.salesType === "jeonse" ? l.deposit : l.rent);
  if (money && parts.price >= 0.6) {
    phrases.push([
      parts.price,
      l.salesType === "jeonse"
        ? [`Jeonse deposit is on the low side (${money})`, `Only ${money} jeonse`, `${money} deposit, cheaper than most`][v(3)]!
        : [`Lower monthly cost (${money}/mo)`, `Rent of ${money}/mo is below most options`, `${money}/mo keeps costs down`][v(3)]!,
    ]);
  }
  const where = c.place?.kind === "place" ? displayPlace(c.place.name) : "the center";
  const meters = Math.round(dist / 10) * 10;
  if (parts.dist >= 0.5) {
    phrases.push([parts.dist * 0.9, [`${meters} m from ${where}`, `Close to ${where} (${meters} m)`, `About ${meters} m to ${where}`][v(3)]!]);
  }
  const year = builtYear(l);
  if (year && parts.age >= 0.6) phrases.push([parts.age * 0.8, [`Built ${year}`, `Newer building (${year})`][v(2)]!]);
  const size = sizeClass(l.areaM2);
  if (l.areaM2 && parts.size >= 0.5 && size) {
    phrases.push([parts.size * 0.7, [`${l.areaM2} m² (${toPyeong(l.areaM2).toFixed(1)} pyeong)`, `${size[0]!.toUpperCase()}${size.slice(1)} at ${l.areaM2} m²`][v(2)]!]);
  }
  for (const hit of prefHits) {
    phrases.push([
      1,
      hit === "subway"
        ? `Subway ${subwayWalkMinutes(l) ?? "a few"} min walk`
        : hit === "elevator"
          ? "Has an elevator"
          : hit === "quiet"
            ? "Listing mentions a quiet setting"
            : hit === "cheap"
              ? "Among the cheapest once deposit is counted"
              : `Matches “${hit}”`,
    ]);
  }
  const photos = photoCount(l);
  if (photos >= 4) phrases.push([parts.photos * 0.5, `${photos} photos`]);
  phrases.sort((a, b) => b[0] - a[0]);
  const top = phrases.slice(0, 3).map(([, text]) => text);
  if (!top.length) return `Fits your constraints, ${meters} m from ${where}`;
  return top.join(v(2) ? " · " : "; ");
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
): ScoredCandidate[] {
  if (!candidates.length) return [];
  const prefKeys = (c.preferences ?? []).map(preferenceKey).filter((k): k is string => Boolean(k));
  const cheap = prefKeys.includes("cheap") || CHEAP_WORDS.test(requestText);
  const wantsNew = prefKeys.includes("newer") || NEW_WORDS.test(requestText);
  const wantsBig = prefKeys.includes("spacious") || BIG_WORDS.test(requestText);
  const allowsBasement = asksForBasementOrRooftop(requestText);
  const effective = candidates
    .map((l) => effectiveMonthlyManwon(l))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const weights = {
    price: cheap ? 0.5 : 0.3,
    dist: CLOSE_WORDS.test(requestText) ? 0.35 : 0.25,
    age: wantsNew ? 0.3 : 0.15,
    size: wantsBig ? 0.25 : 0.1,
    photos: 0.1,
    prefs: prefKeys.filter((k) => k !== "cheap" && k !== "newer" && k !== "spacious").length ? 0.2 : 0,
  };
  const scoringPrefs = prefKeys.filter((k) => k !== "cheap" && k !== "newer" && k !== "spacious");
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const scored = candidates.map((l) => {
    const cost = effectiveMonthlyManwon(l);
    const dist = distanceM(l, center);
    const age = buildingAgeYears(l.approveDate, now);
    const tags = listingTags(l);
    const hits = prefKeys.filter((k) => tags.includes(k) || (k === "cheap" && cost != null && percentile(effective, cost) < 0.35));
    const parts = {
      price: cost == null ? 0.3 : 1 - percentile(effective, cost),
      dist: Math.max(0, 1 - dist / Math.max(radiusM, 1)),
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
    if (c.rooms) score += listingRooms(l) === c.rooms ? 0.12 : -0.04;
    if (kind !== "normal" && !allowsBasement && !c.floorFilter) score -= cheap ? 0.06 : 0.3;
    // Listings with a photo win ties; a card with a placeholder is a weaker pick.
    score += hasAnyPhoto(l) ? 0.02 : -0.02;
    return { listing: l, score, distanceM: dist, reason: genericReason(l, parts, c, dist, hits.filter((h) => h !== "newer" && h !== "spacious" || tags.includes(h))) };
  });
  return scored.sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id));
}

/** Collapse repeats, then cap near-duplicates, keeping the score order. */
export function prepareRanked(ranked: ScoredCandidate[]): {
  ranked: ScoredCandidate[];
  groupSize: Map<string, number>;
} {
  const { items, groupSize } = collapseDuplicates(ranked);
  return { ranked: diversify(items, MAX_NEAR_DUPLICATES), groupSize };
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
  /** Straight-line distance from the search center (not from a subway). */
  metersFromCenter: number;
  subwayWalkMin?: number;
  hasPhoto: boolean;
  facts?: string[];
  title?: string;
  area?: string;
};

export function compactCandidate(
  listing: MapListing,
  center: { lat: number; lng: number },
): CompactCandidate {
  const year = builtYear(listing);
  const tags = listingTags(listing);
  const effective = effectiveMonthlyManwon(listing);
  const out: CompactCandidate = {
    id: listing.id,
    type: propertyTypeLabel[listing.propertyType].toLowerCase(),
    deal: listing.salesType ?? "unknown",
    deposit: listing.salesType === "sale" ? undefined : (formatKrwFromManwon(listing.deposit) ?? undefined),
    monthlyRent:
      listing.salesType === "wolse" && listing.rent != null ? (formatKrwFromManwon(listing.rent) ?? undefined) : undefined,
    maintenanceFee: listing.manageCost ? (formatKrwFromManwon(listing.manageCost) ?? undefined) : undefined,
    salePrice: listing.salesType === "sale" ? (formatKrwFromManwon(listing.price) ?? undefined) : undefined,
    effectiveMonthly: effective != null && listing.salesType !== "sale" ? (formatKrwFromManwon(Math.round(effective * 10) / 10) ?? undefined) : undefined,
    m2: listing.areaM2,
    size: sizeClass(listing.areaM2),
    floor: formatFloor(listing.floor) ?? undefined,
    rooms: listingRooms(listing),
    builtYear: year,
    metersFromCenter: Math.round(distanceM(listing, center) / 10) * 10,
    subwayWalkMin: subwayWalkMinutes(listing),
    hasPhoto: hasAnyPhoto(listing),
    facts: tags.length ? tags.filter((t) => t !== "spacious" && t !== "newer") : undefined,
    title: listing.title?.replace(/\s+/g, " ").slice(0, 40),
    area: areaLabel(listing) ?? undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as CompactCandidate;
}

function cleanLine(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
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

function groundedReason(reason: string | undefined, listing: MapListing): string | undefined {
  if (!reason) return undefined;
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
  groupSize: ReadonlyMap<string, number> = new Map(),
): AskPick[] {
  const byId = new Map(ranked.map((r) => [r.listing.id, r]));
  const out: AskPick[] = [];
  const used = new Set<string>();
  const perGroup = new Map<string, number>();
  const take = (item: ScoredCandidate, reason?: string) => {
    const key = nearDuplicateKey(item.listing);
    perGroup.set(key, (perGroup.get(key) ?? 0) + 1);
    used.add(item.listing.id);
    out.push({
      rank: out.length + 1,
      listing: item.listing,
      reason: reason ?? item.reason,
      reasonSource: reason ? "ai" : "basic",
      distanceM: Math.round(item.distanceM),
    });
  };
  const roomFor = (item: ScoredCandidate) => (perGroup.get(nearDuplicateKey(item.listing)) ?? 0) < MAX_NEAR_DUPLICATES;
  for (const pick of ai?.picks ?? []) {
    const found = byId.get(pick.id);
    if (!found || used.has(pick.id) || !roomFor(found)) continue;
    take(found, groundedReason(pick.reason, found.listing));
  }
  for (const item of ranked) {
    if (out.length >= target) break;
    if (used.has(item.listing.id) || !roomFor(item)) continue;
    take(item);
  }
  // Short of picks because of the cap: fill from what is left rather than show fewer.
  for (const item of ranked) {
    if (out.length >= target) break;
    if (!used.has(item.listing.id)) take(item);
  }
  const shown = new Map<string, number>();
  for (const pick of out) {
    const key = nearDuplicateKey(pick.listing);
    shown.set(key, (shown.get(key) ?? 0) + 1);
  }
  const noted = new Set<string>();
  for (const pick of out) {
    const key = nearDuplicateKey(pick.listing);
    if (noted.has(key)) continue;
    noted.add(key);
    const extra = (groupSize.get(key) ?? 0) - (shown.get(key) ?? 0);
    if (extra > 0) pick.similar = extra;
  }
  return out.slice(0, target).map((pick, index) => ({ ...pick, rank: index + 1 }));
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
