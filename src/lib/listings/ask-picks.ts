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
import { formatKrwFromManwon, propertyTypeLabel, salesTypeLabel } from "./copy";
import { filterListings, isNaverClusterListing } from "./filter";
import { floorFilterLabel, type FloorFilter } from "./floor";
import { listingHasPhotos } from "./photo";
import { normalizePriceFilter, type PriceFilter } from "./price";
import { monthlyCostManwon } from "./recommend";
import {
  propertyTypes as ALL_PROPERTY_TYPES,
  type ListingDetail,
  type MapListing,
  type PropertyType,
  type SalesType,
} from "./types";

export const ASK_PICK_COUNT = 10;
/** Compact candidate summaries sent to the AI. */
export const ASK_MAX_CANDIDATES = 40;
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
      timingsMs?: { fetch: number; rank: number };
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
export function hardFilterCandidates(
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

const CHEAP_WORDS = /\b(cheap|cheapest|affordable|budget|low[- ]cost|inexpensive|save)\b|저렴|싼|가성비/i;
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

function genericReason(
  l: MapListing,
  parts: { price: number; dist: number; age: number; size: number; photos: number; prefs: number },
  c: AskConstraints,
  dist: number,
  prefHits: string[],
): string {
  const phrases: Array<[number, string]> = [];
  const monthly = formatKrwFromManwon(l.salesType === "jeonse" ? l.deposit : l.rent);
  if (monthly && parts.price >= 0.6) {
    phrases.push([parts.price, l.salesType === "jeonse" ? `Lower jeonse deposit (${monthly})` : `Lower monthly cost (${monthly}/mo)`]);
  }
  const where = c.place?.kind === "place" ? displayPlace(c.place.name) : "the center";
  if (parts.dist >= 0.5) phrases.push([parts.dist * 0.9, `${Math.round(dist / 10) * 10} m from ${where}`]);
  const year = builtYear(l);
  if (year && parts.age >= 0.6) phrases.push([parts.age * 0.8, `Built ${year}`]);
  if (l.areaM2 && parts.size >= 0.5) phrases.push([parts.size * 0.7, `${l.areaM2} m² (${toPyeong(l.areaM2).toFixed(1)} pyeong)`]);
  for (const hit of prefHits) {
    phrases.push([
      1,
      hit === "subway"
        ? `Subway ${subwayWalkMinutes(l) ?? "a few"} min walk`
        : hit === "elevator"
          ? "Has an elevator"
          : hit === "quiet"
            ? "Listing mentions a quiet setting"
            : `Matches “${hit}”`,
    ]);
  }
  const photos = photoCount(l);
  if (photos >= 4) phrases.push([parts.photos * 0.5, `${photos} photos`]);
  phrases.sort((a, b) => b[0] - a[0]);
  const top = phrases.slice(0, 3).map(([, text]) => text);
  if (!top.length) return `Fits your constraints, ${Math.round(dist / 10) * 10} m from ${where}`;
  return top.join(" · ");
}

export function fallbackRank(
  candidates: MapListing[],
  c: AskConstraints,
  center: { lat: number; lng: number },
  radiusM: number,
  requestText = "",
  now = new Date(),
): ScoredCandidate[] {
  if (!candidates.length) return [];
  const monthly = candidates.map((l) => monthlyCostManwon(l)).filter((v): v is number => v != null).sort((a, b) => a - b);
  const prefKeys = (c.preferences ?? []).map(preferenceKey).filter((k): k is string => Boolean(k));
  const weights = {
    price: CHEAP_WORDS.test(requestText) ? 0.45 : 0.3,
    dist: CLOSE_WORDS.test(requestText) ? 0.35 : 0.25,
    age: NEW_WORDS.test(requestText) ? 0.3 : 0.15,
    size: BIG_WORDS.test(requestText) ? 0.25 : 0.1,
    photos: 0.1,
    prefs: prefKeys.length ? 0.2 : 0,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const scored = candidates.map((l) => {
    const cost = monthlyCostManwon(l);
    const dist = distanceM(l, center);
    const age = buildingAgeYears(l.approveDate, now);
    const tags = listingTags(l);
    const hits = prefKeys.filter((k) => tags.includes(k));
    const parts = {
      price: cost == null ? 0.3 : 1 - percentile(monthly, cost),
      dist: Math.max(0, 1 - dist / Math.max(radiusM, 1)),
      age: age == null ? 0.4 : Math.max(0, 1 - Math.min(Math.max(age, 0), 30) / 30),
      size: l.areaM2 == null ? 0.3 : Math.min(1, l.areaM2 / 40),
      photos: Math.min(photoCount(l), 6) / 6,
      prefs: prefKeys.length ? hits.length / prefKeys.length : 0,
    };
    const score =
      (parts.price * weights.price +
        parts.dist * weights.dist +
        parts.age * weights.age +
        parts.size * weights.size +
        parts.photos * weights.photos +
        parts.prefs * weights.prefs) /
      total;
    return { listing: l, score, distanceM: dist, reason: genericReason(l, parts, c, dist, hits) };
  });
  return scored.sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id));
}

// ---------------------------------------------------------------- AI summaries

export type CompactCandidate = {
  id: string;
  type: string;
  deal: string;
  /** Pre-formatted KRW, e.g. "₩80 million". Quote these as-is. */
  deposit?: string;
  monthlyRent?: string;
  maintenanceFee?: string;
  salePrice?: string;
  m2?: number;
  floor?: string;
  builtYear?: number;
  buildingAgeYears?: number;
  distanceM: number;
  subwayWalkMin?: number;
  photos: number;
  listedDaysAgo?: number;
  facts: string[];
  title?: string;
  area?: string;
};

export function compactCandidate(
  listing: MapListing,
  center: { lat: number; lng: number },
  now = new Date(),
): CompactCandidate {
  const year = builtYear(listing);
  const updated = listing.updatedAt ? Date.parse(listing.updatedAt.replace(" ", "T") + (listing.updatedAt.includes("T") ? "" : "+09:00")) : NaN;
  return {
    id: listing.id,
    type: propertyTypeLabel[listing.propertyType].toLowerCase(),
    deal: listing.salesType ?? "unknown",
    deposit: listing.salesType === "sale" ? undefined : (formatKrwFromManwon(listing.deposit) ?? undefined),
    monthlyRent:
      listing.salesType === "wolse" && listing.rent != null ? (formatKrwFromManwon(listing.rent) ?? undefined) : undefined,
    maintenanceFee: listing.manageCost ? (formatKrwFromManwon(listing.manageCost) ?? undefined) : undefined,
    salePrice: listing.salesType === "sale" ? (formatKrwFromManwon(listing.price) ?? undefined) : undefined,
    m2: listing.areaM2,
    floor: listing.floor,
    builtYear: year,
    buildingAgeYears: buildingAgeYears(listing.approveDate, now),
    distanceM: Math.round(distanceM(listing, center)),
    subwayWalkMin: subwayWalkMinutes(listing),
    photos: photoCount(listing),
    listedDaysAgo: Number.isFinite(updated) ? Math.max(0, Math.floor((now.getTime() - updated) / 86_400_000)) : undefined,
    facts: listingTags(listing),
    title: listing.title?.replace(/\s+/g, " ").slice(0, 60),
    area: listing.address?.split(/\s+/).slice(-2).join(" ").slice(0, 30),
  };
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

/** Merge AI picks with the deterministic ranking so the carousel is always full. */
export function assemblePicks(
  ai: ValidatedAiRanking | null,
  ranked: ScoredCandidate[],
  target = ASK_PICK_COUNT,
): AskPick[] {
  const byId = new Map(ranked.map((r) => [r.listing.id, r]));
  const out: AskPick[] = [];
  const used = new Set<string>();
  for (const pick of ai?.picks ?? []) {
    const found = byId.get(pick.id);
    if (!found || used.has(pick.id)) continue;
    used.add(pick.id);
    out.push({
      rank: out.length + 1,
      listing: found.listing,
      reason: pick.reason ?? found.reason,
      reasonSource: pick.reason ? "ai" : "basic",
      distanceM: Math.round(found.distanceM),
    });
  }
  for (const item of ranked) {
    if (out.length >= target) break;
    if (used.has(item.listing.id)) continue;
    used.add(item.listing.id);
    out.push({
      rank: out.length + 1,
      listing: item.listing,
      reason: item.reason,
      reasonSource: "basic",
      distanceM: Math.round(item.distanceM),
    });
  }
  return out.slice(0, target);
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

/** Index of the slide nearest the scroll position. */
export function activeSlideIndex(scrollLeft: number, stride: number, count: number): number {
  if (count <= 0 || stride <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / stride)));
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
