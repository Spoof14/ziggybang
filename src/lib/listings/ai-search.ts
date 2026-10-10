import { areaBuckets, type AreaBucketId } from "./area";
import {
  propertyTypeLabel,
  salesTypeFilterLabel,
} from "./copy";
import { ageFilterLabel, parseAgeFilter, type AgeFilter } from "./age";
import { floorFilterLabel, parseFloorFilter, type FloorFilter } from "./floor";
import {
  describeBuildingAgeFilter,
  normalizeBuildingAgeFilter,
  parseMaxBuildingAge,
} from "./building-age";
import { type ViewMode } from "./prefs";
import {
  describePriceFilter,
  normalizePriceFilter,
  type PriceFilter,
} from "./price";
import {
  extractStreetAddress,
  isAskListingToken,
  isListingFilterToken,
  isStationQuery,
  listingFilterQuery,
  matchPlace,
  normalizeSearch,
  unrefinedPlaceLeftover,
} from "./search";
import {
  propertyTypes,
  salesTypes,
  type PropertyType,
  type SalesType,
} from "./types";

export type SearchSnapshot = {
  searchInput: string;
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  radiusM: number;
  viewMode: ViewMode;
  listingQuery?: string;
} & PriceFilter & {
  foreignerOk?: boolean;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
  maxBuildingAge?: number;
  hasPhotos?: boolean;
};

export type SearchIntent = {
  searchInput?: string | null;
  propertyTypes?: PropertyType[] | null;
  salesTypes?: SalesType[] | null;
  areaBucketIds?: AreaBucketId[] | null;
  radiusM?: number | null;
  viewMode?: ViewMode | null;
  minDeposit?: number | null;
  maxDeposit?: number | null;
  minRent?: number | null;
  maxRent?: number | null;
  foreignerOk?: boolean | null;
  floorFilter?: FloorFilter | null;
  ageFilter?: AgeFilter | null;
  listingQuery?: string | null;
  maxBuildingAge?: number | null;
  hasPhotos?: boolean | null;
};

export type InterpretedSearch = {
  intent: SearchIntent;
  snapshot: SearchSnapshot;
  reply: string;
  /** Message had nothing a rental search can act on; filters were left alone. */
  noIntent?: boolean;
};

type MoneyKind = "deposit" | "rent";
type MoneyBound = "min" | "max";

type MoneyHit = {
  manwon: number;
  index: number;
  end: number;
  raw: string;
};

const ALL_TYPES: PropertyType[] = [...propertyTypes];
const ALL_SALES: SalesType[] = [...salesTypes];

function round10(value: number) {
  return Math.round(value / 10) * 10 || value;
}

/**
 * Convert "amount + unit" to 만원 (the unit every filter uses).
 * 600k → 60, 50만원 → 50, 5백만원 → 500, 5천만원 → 5000, 1 million → 100,
 * 1.5억 → 15000, ₩600,000 → 60.
 */
export function parseManwonToken(amount: number, unit: string | undefined): number | undefined {
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const suffix = (unit ?? "").toLowerCase().replace(/\s+/g, "");
  if (suffix === "억") return Math.round(amount * 10_000);
  if (suffix === "천만원" || suffix === "천만" || suffix === "천") {
    return Math.round(amount * 1000);
  }
  if (suffix === "백만원" || suffix === "백만" || suffix === "백") {
    return Math.round(amount * 100);
  }
  if (suffix === "만" || suffix === "만원" || suffix === "만원이하" || suffix === "만워") {
    return Math.round(amount);
  }
  if (suffix === "million" || suffix === "mil" || /^m(?:won|krw)$/.test(suffix)) {
    return Math.round(amount * 100);
  }
  if (suffix === "k" || suffix === "kwon" || suffix === "kkrw") {
    return Math.round((amount * 1000) / 10_000);
  }
  if (suffix === "원" || suffix === "krw" || suffix === "won") {
    return Math.round(amount / 10_000);
  }
  if (amount >= 10_000) return Math.round(amount / 10_000);
  return Math.round(amount);
}

const MONEY_RE =
  /₩?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(억|천\s*만\s*원?|백\s*만\s*원?|만\s*원|만|million|mil\b|m\s*(?:won|krw)\b|k\s*(?:won|krw)?\b|원|krw|won)?/gi;

function extractMoney(text: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const re = new RegExp(MONEY_RE.source, MONEY_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = match[0] ?? "";
    const after = text.slice(match.index + raw.length, match.index + raw.length + 14);
    // A bare number followed by a non-money unit is a distance, area or age.
    if (
      !match[2] &&
      /^\s*(?:pyeong|py\b|평|m²|m2|sqm|square|meters?|metres?|m\b|minutes?|min\b|km|years?|yrs?|y\b|년|층|f\b|floors?|bed|bedrooms?|rooms?|룸|%)/i.test(
        after,
      )
    ) {
      continue;
    }
    if (match[2] && /^\s*(?:years?|yrs?|년)/i.test(after)) continue;
    const amount = Number((match[1] ?? "").replace(/,/g, ""));
    const manwon = parseManwonToken(amount, match[2]);
    if (manwon == null || manwon <= 0) continue;
    hits.push({
      manwon,
      index: match.index,
      end: match.index + raw.length,
      raw,
    });
  }
  return hits;
}

function leftRight(text: string, hit: MoneyHit, leftN = 48, rightN = 18) {
  return {
    left: text.slice(Math.max(0, hit.index - leftN), hit.index),
    right: text.slice(hit.end, Math.min(text.length, hit.end + rightN)),
  };
}

function lastMatchIndex(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let best = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) best = match.index;
  return best;
}

function classifyKind(text: string, hit: MoneyHit): MoneyKind {
  const { left, right } = leftRight(text, hit);
  const depositRe = /deposit|보증금|key money|down payment|전세/i;
  const rentRe = /rent|monthly|월세|a month|per month|\/\s*mo|budget/i;
  const depositAt = lastMatchIndex(left, depositRe);
  const rentAt = lastMatchIndex(left, rentRe);
  if (depositAt >= 0 || rentAt >= 0) {
    return depositAt > rentAt ? "deposit" : "rent";
  }
  if (rentRe.test(right) && !depositRe.test(right)) return "rent";
  if (depositRe.test(right) && !rentRe.test(right)) return "deposit";
  return hit.manwon > 300 ? "deposit" : "rent";
}

function classifyBound(text: string, hit: MoneyHit): MoneyBound {
  const { left, right } = leftRight(text, hit);
  if (/^\s*(?:이상|or more|and (?:up|above|over)|\+|minimum)/i.test(right)) return "min";
  if (
    /min(?:imum)?|at least|over|above|more than|from|starting|≥|>=|이상|최소/i.test(
      left,
    )
  ) {
    return "min";
  }
  return "max";
}

function parsePriceIntent(text: string): PriceFilter {
  const hits = extractMoney(text);
  const next: PriceFilter = {};
  const between = text.match(
    /(?:between|from)\s+([^,]+?)\s+(?:and|to|-)\s+([^,]+?)(?:\s+(deposit|rent|monthly|보증금|월세))?/i,
  );
  if (between) {
    const left = extractMoney(between[1] ?? "")[0];
    const right = extractMoney(between[2] ?? "")[0];
    const kind: MoneyKind = /rent|monthly|월세/i.test(between[0] ?? "")
      ? "rent"
      : /deposit|보증금/i.test(between[0] ?? "")
        ? "deposit"
        : left && left.manwon > 300
          ? "deposit"
          : "rent";
    if (left && right) {
      const min = Math.min(left.manwon, right.manwon);
      const max = Math.max(left.manwon, right.manwon);
      if (kind === "rent") {
        next.minRent = min;
        next.maxRent = max;
      } else {
        next.minDeposit = min;
        next.maxDeposit = max;
      }
    }
  }

  const dash = text.match(
    /(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)\s*(만|만원|억)?\s*(deposit|rent|monthly|보증금|월세)?/i,
  );
  if (dash && next.minDeposit == null && next.minRent == null) {
    const unit = dash[3];
    const left = parseManwonToken(Number(dash[1]), unit);
    const right = parseManwonToken(Number(dash[2]), unit);
    const kind: MoneyKind = /rent|monthly|월세/i.test(dash[4] ?? dash[0] ?? "")
      ? "rent"
      : /deposit|보증금/i.test(dash[4] ?? dash[0] ?? "")
        ? "deposit"
        : (left ?? 0) > 300
          ? "deposit"
          : "rent";
    if (left && right) {
      if (kind === "rent") {
        next.minRent = Math.min(left, right);
        next.maxRent = Math.max(left, right);
      } else {
        next.minDeposit = Math.min(left, right);
        next.maxDeposit = Math.max(left, right);
      }
    }
  }

  for (const hit of hits) {
    const kind = classifyKind(text, hit);
    const bound = classifyBound(text, hit);
    if (kind === "deposit") {
      if (bound === "min" && next.minDeposit == null) next.minDeposit = hit.manwon;
      if (bound === "max" && next.maxDeposit == null) next.maxDeposit = hit.manwon;
    } else {
      if (bound === "min" && next.minRent == null) next.minRent = hit.manwon;
      if (bound === "max" && next.maxRent == null) next.maxRent = hit.manwon;
    }
  }
  return normalizePriceFilter(next);
}

function parsePropertyTypes(text: string): PropertyType[] | undefined {
  const types: PropertyType[] = [];
  if (/studio|one-?room|원룸|오픈형|분리형/i.test(text)) types.push("oneroom");
  if (/\bvillas?\b|빌라|주택/i.test(text)) types.push("villa");
  if (/officetel|oftel|오피스텔/i.test(text)) types.push("officetel");
  if (/\bapartments?\b|\bapt\b|아파트/i.test(text)) types.push("apartment");
  if (!types.length) return undefined;
  return types;
}

function parseSalesTypes(text: string, price: PriceFilter): SalesType[] | undefined {
  const types: SalesType[] = [];
  if (/jeonse|전세|key money/i.test(text)) types.push("jeonse");
  if (/wolse|월세|monthly|\brent\b|a month|per month/i.test(text)) types.push("wolse");
  if (/\b(sale|buy|purchase|매매)\b/i.test(text)) types.push("sale");
  if (!types.length && (price.minRent != null || price.maxRent != null)) {
    types.push("wolse");
  }
  if (!types.length) return undefined;
  return types;
}

function parseAreaBuckets(text: string): AreaBucketId[] | undefined {
  if (/tiny|compact|very small|under 20\s*(?:m²|m2|sqm|square)|\bxs\b|< ?6 py/i.test(text)) {
    return ["xs"];
  }
  if (/small studio|6-?10 py|20-?33/i.test(text)) return ["s"];
  if (/family|spacious|large|50\+|15\+ py/i.test(text)) return ["l"];
  if (/10-?15 py|33-?50/i.test(text)) return ["m"];
  const pyeong = text.match(/(\d+(?:\.\d+)?)\s*(?:pyeong|py)\b/i);
  if (pyeong) {
    const value = Number(pyeong[1]);
    const m2 = value * 3.3058;
    const match = areaBuckets.filter((bucket) => {
      if (m2 < bucket.minM2) return false;
      if (bucket.maxM2 != null && m2 >= bucket.maxM2) return false;
      return true;
    });
    if (match[0]) return [match[0].id];
  }
  return undefined;
}

function parseRadius(text: string): number | undefined {
  const meters = text.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?|m|meters?)\b/i);
  if (meters) {
    const value = Number(meters[1]);
    const radiusM = /km/i.test(meters[2] ?? "") ? value * 1000 : value;
    if (Number.isFinite(radiusM)) {
      return Math.min(3000, Math.max(250, Math.round(radiusM)));
    }
  }
  if (/walk(?:ing)? distance|near(?:by)? (?:the )?station|도보/i.test(text)) {
    return 800;
  }
  if (/\bnear\b|\baround\b|\bclose to\b|근처/i.test(text)) return 1000;
  return undefined;
}

function relativePrice(text: string, current: SearchSnapshot): PriceFilter {
  const cheaper = /\b(cheaper|lower budget|too expensive|less rent|bring.*down)\b/i.test(text);
  const higher = /\b(higher budget|more rent|can spend more|a bit more)\b/i.test(text);
  if (!cheaper && !higher) return {};
  const factor = cheaper ? 0.8 : 1.25;
  const next: PriceFilter = {};
  if (current.maxRent != null) next.maxRent = Math.max(10, round10(current.maxRent * factor));
  else if (cheaper) next.maxRent = 70;
  if (current.maxDeposit != null) {
    next.maxDeposit = Math.max(50, round10(current.maxDeposit * factor));
  }
  return next;
}

export function mergeSearchIntent(
  current: SearchSnapshot,
  patch: SearchIntent,
): SearchSnapshot {
  const price = normalizePriceFilter({
    minDeposit: patch.minDeposit === null ? undefined : (patch.minDeposit ?? current.minDeposit),
    maxDeposit: patch.maxDeposit === null ? undefined : (patch.maxDeposit ?? current.maxDeposit),
    minRent: patch.minRent === null ? undefined : (patch.minRent ?? current.minRent),
    maxRent: patch.maxRent === null ? undefined : (patch.maxRent ?? current.maxRent),
  });
  const propertyTypesNext =
    patch.propertyTypes === null
      ? ALL_TYPES
      : patch.propertyTypes?.length
        ? patch.propertyTypes
        : current.propertyTypes;
  const salesTypesNext =
    patch.salesTypes === null
      ? ALL_SALES
      : patch.salesTypes?.length
        ? patch.salesTypes
        : current.salesTypes;
  const areas =
    patch.areaBucketIds === null
      ? []
      : patch.areaBucketIds
        ? patch.areaBucketIds
        : current.areaBucketIds;
  return {
    searchInput:
      patch.searchInput === null ? "" : (patch.searchInput ?? current.searchInput),
    propertyTypes: propertyTypesNext.length ? propertyTypesNext : ALL_TYPES,
    salesTypes: salesTypesNext.length ? salesTypesNext : ALL_SALES,
    areaBucketIds: areas,
    radiusM:
      patch.radiusM === null
        ? 1200
        : patch.radiusM != null
          ? Math.min(3000, Math.max(250, patch.radiusM))
          : current.radiusM,
    viewMode: patch.viewMode === null ? "map" : (patch.viewMode ?? current.viewMode),
    foreignerOk:
      patch.foreignerOk === null ? false : (patch.foreignerOk ?? current.foreignerOk),
    hasPhotos:
      patch.hasPhotos === null ? false : (patch.hasPhotos ?? current.hasPhotos),
    floorFilter:
      patch.floorFilter === null ? undefined : (patch.floorFilter ?? current.floorFilter),
    ageFilter:
      patch.ageFilter === null ? undefined : (patch.ageFilter ?? current.ageFilter),
    listingQuery:
      patch.listingQuery === null
        ? undefined
        : (patch.listingQuery ?? current.listingQuery),
    maxBuildingAge:
      patch.maxBuildingAge === null
        ? undefined
        : normalizeBuildingAgeFilter({
            maxBuildingAge: patch.maxBuildingAge ?? current.maxBuildingAge,
          }).maxBuildingAge,
    ...price,
  };
}

export function describeSearchSnapshot(snapshot: SearchSnapshot): string {
  const where = snapshot.searchInput.trim() || "the current map";
  const types = snapshot.propertyTypes.length && snapshot.propertyTypes.length < ALL_TYPES.length
    ? snapshot.propertyTypes.map((type) => propertyTypeLabel[type]).join(", ")
    : "homes";
  const deals = snapshot.salesTypes.length && snapshot.salesTypes.length < ALL_SALES.length
    ? snapshot.salesTypes.map((type) => salesTypeFilterLabel[type]).join(" / ")
    : null;
  const price = describePriceFilter(snapshot);
  const size = snapshot.areaBucketIds.length
    ? areaBuckets
        .filter((bucket) => snapshot.areaBucketIds.includes(bucket.id))
        .map((bucket) => bucket.label)
        .join(", ")
    : null;
  return [
    `Looking for ${deals ? deals.toLowerCase() : ""} ${types} near ${where}.`.replace(/\s+/g, " "),
    price,
    size ? `Size: ${size}.` : null,
    snapshot.foreignerOk ? "Only listings that say foreigners are welcome." : null,
    snapshot.hasPhotos ? "Only listings with photos." : null,
    snapshot.floorFilter ? `${floorFilterLabel[snapshot.floorFilter]}.` : null,
    snapshot.ageFilter ? `${ageFilterLabel[snapshot.ageFilter]}.` : null,
    describeBuildingAgeFilter(snapshot.maxBuildingAge),
    snapshot.listingQuery ? `Matching “${snapshot.listingQuery}”.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function isFollowUp(text: string): boolean {
  return /^(?:a bit )?cheaper\b|higher budget|too expensive|clear |anywhere|less rent|more rent|make (?:the )?(?:rent|deposit)|bring (?:it|the rent) down/i.test(
    text.trim(),
  );
}

export function isFreshAsk(text: string, intent: SearchIntent): boolean {
  if (isFollowUp(text)) return false;
  if (intent.searchInput) return true;
  return /\b(find|search|show me|looking for|i want|near)\b/i.test(text);
}

export function emptyAskSnapshot(
  current: Pick<SearchSnapshot, "radiusM"> &
    Partial<Pick<SearchSnapshot, "viewMode" | "salesTypes">>,
): SearchSnapshot {
  return {
    searchInput: "",
    propertyTypes: ALL_TYPES,
    // A fresh search drops old filters, including a leftover jeonse/wolse
    // choice the new message never mentioned; only the view is kept.
    salesTypes: ["jeonse", "wolse"],
    areaBucketIds: [],
    radiusM: current.radiusM || 1200,
    viewMode: current.viewMode ?? "list",
  };
}

export function appendUniqueSearchTerms(base: string, extra?: string | null): string {
  const extraTerms = normalizeSearch(extra ?? "")
    .split(" ")
    .filter(Boolean);
  if (!extraTerms.length) return base.trim();
  const hay = ` ${normalizeSearch(base)} `;
  const missing = extraTerms.filter((term) => !hay.includes(` ${term} `));
  if (!missing.length) return base.trim();
  return [base.trim(), missing.join(" ")].filter(Boolean).join(" ");
}

function usableLocalListingQuery(query?: string | null): string | null | undefined {
  if (query == null) return query;
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  if (tokens.length > 4) return null;
  return query.trim();
}

export type AskFallbackReason =
  | "rate_limited"
  | "quota"
  | "auth"
  | "timeout"
  | "error";

/** Small UI notice shown when on-site search answered instead of the AI. */
export const ASK_FALLBACK_NOTICE: Record<AskFallbackReason, string> = {
  rate_limited: "Using basic search — AI is busy",
  quota: "Using basic search — AI quota exhausted",
  auth: "Using basic search — AI key rejected",
  timeout: "Using basic search — AI took too long",
  error: "Using basic search — AI is unavailable",
};

export const OFF_TOPIC_REPLY =
  "I can only help with finding rentals. Try a neighborhood or station, a budget, or a type, like “studio near Hongdae under ₩700,000”. Your filters are unchanged.";
export const ROOM_COUNT_NOTE =
  "Room count isn't supported yet, so I didn't filter by bedrooms.";

/** True when the message asks for a bedroom / room count (we have no such filter). */
export function mentionsRoomCount(text: string): boolean {
  return /\b(?:\d+|one|two|three|four|1|2|3)[\s-]*(?:bed(?:room)?s?|br|rooms?)\b|\b(?:studio|1|one)[\s-]*bed\b|투룸|쓰리룸|2룸|3룸|방\s*[2-4]\s*개|방\s*(?:두|세|네)\s*개/i.test(
    text,
  );
}

const CLEAR_WORDS =
  /\b(clear|reset|remove|any|anywhere|no (?:price|budget|limit|filter)s?|ignore|don'?t care|doesn'?t matter|include)\b|상관없|무관|제한\s*없/i;
const SIZE_WORDS =
  /\b(tiny|compact|small|smaller|large|larger|big|bigger|spacious|family|xs)\b|\d+(?:\.\d+)?\s*(?:pyeong|py\b|평|m²|m2|sqm|square)|\bsize\b|평수|넓|좁/i;
const RADIUS_WORDS =
  /\b(near|nearby|around|close to|within|walk(?:ing)?|radius|station|subway)\b|\d\s*(?:km|m\b|meters?)|근처|도보|역\b|반경/i;
const VIEW_WORDS = {
  map: /\b(on the map|map view|show (?:me )?the map)\b|지도/i,
  list: /\b(list view|as a list|show (?:me )?(?:a |the )?list|list them)\b|목록/i,
  best:
    /recommend|best value|good value|best (?:homes?|places?|apartments?|studios?)|nicest|good photos|for me\b|추천/i,
};
const PHOTO_WORDS = /\b(photos?|pictures?|pics?)\b|사진/i;
const FOREIGNER_WORDS = /foreigner|외국인/i;
const FLOOR_WORDS = /\b(floors?|basement|semi-?basement|\d+\s*f\+?|high floors?|ground)\b|반지하|지하|고층|저층|층/i;
const BUILDING_AGE_WORDS = /\b(years?|yrs?|built|newer|newest|old|new build(?:ing)?s?|age)\b|년|신축|준공/i;
const HAS_NUMBER = /\d|억|만원|천만|백만|million|\b(?:one|two|three|four|five|ten|hundred|thousand)\b/i;

function dropNull<T>(value: T | null | undefined, allowClear: boolean): T | null | undefined {
  return value === null && !allowClear ? undefined : value;
}

const PLACE_NOISE =
  /^(?:near|nearby|around|close|years?|yrs?|old|older|newer|newest|good|great|nice|value|homes?|places?|rent|monthly|under|over|max|min|less|than|in|at|the|a|an|bedrooms?|beds?|투룸|쓰리룸|이하|이상|만원|k|million)$/i;

function cleanPlaceText(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  const kept = value
    .split(/\s+/)
    .filter((token) => token && !/\d/.test(token))
    .filter((token) => {
      const normalized = normalizeSearch(token);
      return normalized && !isListingFilterToken(normalized) && !PLACE_NOISE.test(normalized);
    });
  if (kept.length > 4) return undefined;
  return kept.join(" ").trim() || undefined;
}

/**
 * Drop every field the user's message gives no evidence for. The model (or
 * a loose regex) sometimes volunteers filters — a listing-date window for
 * "newest", a size bucket for "under 200 million" — and those silently
 * narrow results. Explicit nulls ("clear the budget") only survive when
 * the text asks for a clear.
 */
export function groundIntent(intent: SearchIntent, fullText: string): SearchIntent {
  // A street number ("양화로 160") is not a rent or a distance.
  const address = extractStreetAddress(fullText);
  const text = address ? fullText.replace(address, " ") : fullText;
  const clear = CLEAR_WORDS.test(text);
  const out: SearchIntent = {};
  const place = cleanPlaceText(intent.searchInput);
  if (address) out.searchInput = address;
  else if (place !== undefined) out.searchInput = place;
  else if (intent.searchInput === null && clear) out.searchInput = null;

  if (intent.listingQuery === null) {
    if (clear) out.listingQuery = null;
  } else if (intent.listingQuery) {
    const haystack = ` ${normalizeSearch(text)} `;
    const tokens = intent.listingQuery
      .split(/\s+/)
      .filter(
        (token) =>
          haystack.includes(` ${normalizeSearch(token)} `) &&
          isAskListingToken(token),
      );
    if (tokens.length) out.listingQuery = tokens.join(" ");
  }

  const typeEvidence = parsePropertyTypes(text);
  const types = dropNull(intent.propertyTypes, clear);
  if (types === null) out.propertyTypes = null;
  else if (types && typeEvidence) {
    const kept = types.filter((type) => typeEvidence.includes(type));
    if (kept.length) out.propertyTypes = kept;
  }

  const priceEvidence = parsePriceIntent(text);
  const salesEvidence = parseSalesTypes(text, priceEvidence);
  const sales = dropNull(intent.salesTypes, clear);
  if (sales === null) out.salesTypes = null;
  else if (sales && salesEvidence) {
    const kept = sales.filter((type) => salesEvidence.includes(type));
    if (kept.length) out.salesTypes = kept;
  }

  const areas = dropNull(intent.areaBucketIds, clear);
  if (areas === null) out.areaBucketIds = null;
  else if (areas && SIZE_WORDS.test(text)) out.areaBucketIds = areas;

  if (typeof intent.radiusM === "number" && RADIUS_WORDS.test(text)) {
    out.radiusM = intent.radiusM;
  } else if (intent.radiusM === null && clear) out.radiusM = null;

  const view = intent.viewMode;
  if (view === "map" && VIEW_WORDS.map.test(text)) out.viewMode = "map";
  else if (view === "list" && VIEW_WORDS.list.test(text)) out.viewMode = "list";
  else if (view === "best" && VIEW_WORDS.best.test(text)) out.viewMode = "best";

  // Money: our own parser is authoritative for numbers (600k, 만원, 백만…),
  // so a model value only survives when the parser found nothing to
  // contradict and the text really contains a number.
  const hasMoney = HAS_NUMBER.test(text);
  const localMoney = [
    priceEvidence.minDeposit,
    priceEvidence.maxDeposit,
    priceEvidence.minRent,
    priceEvidence.maxRent,
  ].some((value) => value != null);
  for (const key of ["minDeposit", "maxDeposit", "minRent", "maxRent"] as const) {
    const value = intent[key];
    if (value === null) {
      if (clear) out[key] = null;
    } else if (typeof value === "number") {
      if (localMoney) {
        if (priceEvidence[key] != null) out[key] = priceEvidence[key];
      } else if (hasMoney) out[key] = value;
    } else if (localMoney && priceEvidence[key] != null) {
      out[key] = priceEvidence[key];
    }
  }

  if (typeof intent.foreignerOk === "boolean" && FOREIGNER_WORDS.test(text)) {
    out.foreignerOk = intent.foreignerOk;
  } else if (intent.foreignerOk === null && clear) out.foreignerOk = null;
  if (typeof intent.hasPhotos === "boolean" && PHOTO_WORDS.test(text)) {
    out.hasPhotos = intent.hasPhotos;
  } else if (intent.hasPhotos === null && clear) out.hasPhotos = null;

  const floorEvidence = parseFloorFilter(text).floorFilter;
  if (intent.floorFilter && FLOOR_WORDS.test(text)) out.floorFilter = intent.floorFilter;
  else if (floorEvidence) out.floorFilter = floorEvidence;
  else if (intent.floorFilter === null && clear) out.floorFilter = null;

  // Listing recency (week/month) only when the user said so; "newest
  // buildings" is building age, not "listed this month".
  const recency = parseAgeFilter(text).ageFilter;
  if (intent.ageFilter && recency === intent.ageFilter) out.ageFilter = recency;
  else if (intent.ageFilter === null && clear) out.ageFilter = null;

  const builtLocal = parseMaxBuildingAge(text);
  if (typeof intent.maxBuildingAge === "number" && BUILDING_AGE_WORDS.test(text)) {
    out.maxBuildingAge = builtLocal ?? intent.maxBuildingAge;
  } else if (builtLocal) out.maxBuildingAge = builtLocal;
  else if (intent.maxBuildingAge === null && clear) out.maxBuildingAge = null;
  return out;
}

/** Does the intent change anything a rental search can act on? */
export function hasSearchIntent(intent: SearchIntent): boolean {
  return (
    intent.searchInput !== undefined ||
    intent.listingQuery !== undefined ||
    intent.propertyTypes !== undefined ||
    intent.salesTypes !== undefined ||
    intent.areaBucketIds !== undefined ||
    intent.minDeposit !== undefined ||
    intent.maxDeposit !== undefined ||
    intent.minRent !== undefined ||
    intent.maxRent !== undefined ||
    intent.foreignerOk !== undefined ||
    intent.hasPhotos !== undefined ||
    intent.floorFilter !== undefined ||
    intent.ageFilter !== undefined ||
    intent.maxBuildingAge !== undefined ||
    intent.viewMode !== undefined
  );
}

/**
 * Prefer OpenAI's structured filters, grounded against the message so only
 * what the user stated is applied. Fill place / building age from the local
 * parser when the model omitted them.
 */
export function composeAskIntent(
  ai: SearchIntent,
  local: SearchIntent,
  fresh: boolean,
  text?: string,
): SearchIntent {
  const grounded = text === undefined ? ai : groundIntent(ai, text);
  return {
    ...grounded,
    // Type / deal words are plain text evidence: if the model dropped them
    // (e.g. because a room count was mentioned), keep what the parser found.
    propertyTypes:
      grounded.propertyTypes === undefined ? local.propertyTypes : grounded.propertyTypes,
    salesTypes: grounded.salesTypes === undefined ? local.salesTypes : grounded.salesTypes,
    searchInput:
      grounded.searchInput === undefined ? local.searchInput : grounded.searchInput,
    radiusM: grounded.radiusM === undefined ? local.radiusM : grounded.radiusM,
    maxBuildingAge:
      grounded.maxBuildingAge === undefined ? local.maxBuildingAge : grounded.maxBuildingAge,
    viewMode: grounded.viewMode ?? local.viewMode,
    listingQuery:
      grounded.listingQuery === undefined
        ? fresh
          ? (usableLocalListingQuery(local.listingQuery) ?? undefined)
          : undefined
        : grounded.listingQuery,
  };
}

export function interpretSearch(
  message: string,
  current: SearchSnapshot,
): InterpretedSearch {
  const address = extractStreetAddress(message);
  const text = (address ? message.replace(address, " ") : message).replace(/\s+/g, " ").trim();
  const intent: SearchIntent = {};
  const followUp = isFollowUp(text);
  const place = followUp || address ? undefined : matchPlace(text);
  if (address) {
    intent.searchInput = address;
  } else if (place) {
    const geoLeftover = unrefinedPlaceLeftover(text, place);
    if (isStationQuery(text)) {
      const base = place.names[0] ?? place.id;
      intent.searchInput = /station|역/i.test(base) ? base : `${base} station`;
    } else if (geoLeftover && geoLeftover.split(/\s+/).length <= 2) {
      intent.searchInput = `${place.names[0]} ${geoLeftover}`;
    } else {
      intent.searchInput = place.names[0] ?? place.id;
    }
  }
  // The search box is for place names; only amenity words (pet, furnished…)
  // may ride along to match listing titles. Type/rent words are filters.
  const leftover = followUp
    ? undefined
    : listingFilterQuery(text, place)
        .split(/\s+/)
        .filter((token) => isAskListingToken(token))
        .join(" ") || undefined;
  if (leftover) intent.listingQuery = leftover;

  const maxBuildingAge = followUp ? undefined : parseMaxBuildingAge(text);
  if (maxBuildingAge) intent.maxBuildingAge = maxBuildingAge;
  if (/any building age|any age building|old buildings? (ok|fine)/i.test(text)) {
    intent.maxBuildingAge = null;
  }

  const price = {
    ...relativePrice(text, current),
    ...parsePriceIntent(text),
  };
  if (price.minDeposit != null) intent.minDeposit = price.minDeposit;
  if (price.maxDeposit != null) intent.maxDeposit = price.maxDeposit;
  if (price.minRent != null) intent.minRent = price.minRent;
  if (price.maxRent != null) intent.maxRent = price.maxRent;

  const types = parsePropertyTypes(text);
  if (types) intent.propertyTypes = types;
  const sales = parseSalesTypes(text, price);
  if (sales) intent.salesTypes = sales;
  const areas = parseAreaBuckets(text);
  if (areas) intent.areaBucketIds = areas;
  const radiusM = parseRadius(text) ?? (place ? (place.radiusM ?? undefined) : undefined);
  if (radiusM && (Boolean(place) || RADIUS_WORDS.test(text))) intent.radiusM = radiusM;
  if (VIEW_WORDS.map.test(text)) intent.viewMode = "map";
  else if (VIEW_WORDS.best.test(text)) intent.viewMode = "best";
  else if (VIEW_WORDS.list.test(text)) intent.viewMode = "list";

  if (/clear (the )?(price|budget|deposit|rent)|any budget|no price/i.test(text)) {
    intent.minDeposit = null;
    intent.maxDeposit = null;
    intent.minRent = null;
    intent.maxRent = null;
  }
  if (/anywhere|clear (the )?(area|place|search)/i.test(text)) {
    intent.searchInput = null;
    intent.listingQuery = null;
  }
  if (
    /foreigners?\s+welcome|accepts?\s+foreigners?|외국인\s*(환영|가능)|for foreigners/i.test(
      text,
    )
  ) {
    intent.foreignerOk = true;
  }
  if (/any landlord|clear foreigner/i.test(text)) {
    intent.foreignerOk = null;
  }
  if (
    /\b(?:with|has|have)\s+(?:photos?|pictures?)\b|사진\s*있/i.test(text)
  ) {
    intent.hasPhotos = true;
  }
  if (/any photos?|clear photos?|without photos?/i.test(text)) {
    intent.hasPhotos = null;
  }
  const floor = followUp ? { floorFilter: undefined } : parseFloorFilter(text);
  if (floor.floorFilter) intent.floorFilter = floor.floorFilter;
  if (/any floor|clear floor|basement (ok|fine)|include basement/i.test(text)) {
    intent.floorFilter = null;
  }
  const age = followUp ? { ageFilter: undefined } : parseAgeFilter(text);
  if (age.ageFilter) intent.ageFilter = age.ageFilter;
  if (/any age|clear age|old (ok|fine)|include old/i.test(text)) {
    intent.ageFilter = null;
  }

  const roomCount = mentionsRoomCount(text);
  if (!hasSearchIntent(intent)) {
    // Off-topic or too vague to act on: leave every filter and the view alone.
    return {
      intent: {},
      snapshot: current,
      reply: roomCount ? `${ROOM_COUNT_NOTE} ${OFF_TOPIC_REPLY}` : OFF_TOPIC_REPLY,
      noIntent: true,
    };
  }

  const snapshot = mergeSearchIntent(
    followUp || !isFreshAsk(text, intent) ? current : emptyAskSnapshot(current),
    intent,
  );
  const reply = [describeSearchSnapshot(snapshot), roomCount ? ROOM_COUNT_NOTE : null]
    .filter(Boolean)
    .join(" ");
  return { intent, snapshot, reply };
}

export const ASK_SUGGESTIONS = [
  "Best value studios near Hongdae, with decent photos",
  "Good value places under 15 years old near Guro Digital",
  "No basement near Guro Digital",
];
