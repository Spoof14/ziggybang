import { places, type Place } from "~/lib/geo/places";
import { type CircleFilter } from "~/lib/geo/shape";
import { t } from "~/lib/i18n";
import {
  formatRoomType,
  propertyTypeLabel,
  salesTypeFilterLabel,
  salesTypeLabel,
  sourceLabel,
} from "./copy";
import { parseAgeFilter, type AgeFilter } from "./age";
import { parseFloorFilter, type FloorFilter } from "./floor";
import { type MapListing } from "./types";

const CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const JUNG = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
];
const JONG = [
  "",
  "k",
  "k",
  "kt",
  "n",
  "n",
  "nh",
  "t",
  "l",
  "lk",
  "lm",
  "lb",
  "ls",
  "lt",
  "lp",
  "lh",
  "m",
  "p",
  "p",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "h",
];

const SYNONYMS: Record<string, string[]> = {
  studio: ["oneroom", "one-room", "원룸", "오픈형", "분리형", "복층"],
  villa: ["빌라", "주택", "house"],
  officetel: ["오피스텔", "officetel", "oftel"],
  apartment: ["아파트", "apt", "단지", "complex"],
  jeonse: ["전세", "key money"],
  monthly: ["wolse", "월세", "rent"],
  sale: ["매매", "buy", "purchase"],
  basement: ["반지하", "semi-basement"],
  rooftop: ["옥탑", "oktap"],
};

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function romanizeHangul(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) {
      out += char;
      continue;
    }
    const sIndex = code - 0xac00;
    const cho = Math.floor(sIndex / 588);
    const jung = Math.floor((sIndex % 588) / 28);
    const jong = sIndex % 28;
    out += `${CHO[cho] ?? ""}${JUNG[jung] ?? ""}${JONG[jong] ?? ""}`;
  }
  return out;
}

/** Damerau-Levenshtein (optimal string alignment): a swap like "hongdea" -> "hongdae" costs 1. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = value;
    }
  }
  return rows[a.length]![b.length]!;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function fuzzyIncludes(haystack: string, needle: string): boolean {
  const h = normalizeSearch(haystack);
  const n = normalizeSearch(needle);
  if (!n) return true;
  if (!h) return false;
  if (n.length <= 2) {
    return new RegExp(`(?:^|\\s)${escapeRegExp(n)}(?:$|\\s)`).test(` ${h} `);
  }
  if (h.includes(n)) return true;
  const romanHay = normalizeSearch(romanizeHangul(haystack));
  const romanNeedle = normalizeSearch(romanizeHangul(needle));
  if (romanHay && romanNeedle && romanHay.includes(romanNeedle)) return true;
  if (n.length >= 4 && h.split(" ").some((token) => levenshtein(token, n) <= 1)) {
    return true;
  }
  if (
    romanNeedle.length >= 4 &&
    romanHay.split(" ").some((token) => levenshtein(token, romanNeedle) <= 1)
  ) {
    return true;
  }
  return false;
}

function expandQuery(query: string): string[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  const extras = SYNONYMS[normalized] ?? [];
  for (const [key, aliases] of Object.entries(SYNONYMS)) {
    if (aliases.some((alias) => normalizeSearch(alias) === normalized)) {
      extras.push(key, ...aliases);
    }
  }
  return [...new Set([normalized, ...extras.map(normalizeSearch)])];
}

export function listingSearchText(listing: MapListing): string {
  const parts = [
    listing.title,
    listing.address,
    listing.description,
    listing.roomType,
    formatRoomType(listing.roomType),
    propertyTypeLabel[listing.propertyType],
    listing.salesType ? salesTypeLabel[listing.salesType] : "",
    listing.salesType ? salesTypeFilterLabel[listing.salesType] : "",
    sourceLabel[listing.source],
    listing.propertyType === "oneroom" ? "원룸 studio" : "",
    listing.propertyType === "villa" ? "빌라 villa" : "",
    listing.propertyType === "officetel" ? "오피스텔 officetel" : "",
    listing.propertyType === "apartment" ? "아파트 apartment" : "",
    listing.salesType === "jeonse" ? "전세 jeonse" : "",
    listing.salesType === "wolse" ? "월세 monthly rent" : "",
    listing.salesType === "sale" ? "매매 sale" : "",
    listing.foreignerOk ? "foreigner foreigners welcome 외국인환영" : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function listingMatchesQuery(listing: MapListing, query: string): boolean {
  const tokens = normalizeSearch(query)
    .split(" ")
    .filter(Boolean);
  if (!tokens.length) return true;
  const haystack = listingSearchText(listing);
  return tokens.every((token) => {
    const variants = expandQuery(token);
    return variants.some((variant) => fuzzyIncludes(haystack, variant));
  });
}

export function stripStationWords(query: string): string {
  return query
    .replace(/\b(station|subway|yeok|walk|minutes?|min)\b/gi, " ")
    .replace(/역/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "양화로 160", "서울 마포구 양화로 160", "160 Yanghwa-ro": a street address, not a neighborhood. */
export function looksLikeStreetAddress(query: string): boolean {
  return (
    /[가-힣]+(?:대로|로|길)\s*\d+(?:-\d+)?/.test(query) ||
    /[가-힣]+\d*번?길\s*\d+/.test(query) ||
    /\b\d+[\s,]+[a-z]+(?:-[a-z]+)*-(?:ro|gil|daero)\b/i.test(query) ||
    /\b[a-z]+(?:-[a-z]+)*-(?:ro|gil|daero)\s+\d+/i.test(query)
  );
}

/** The street-address part of a message ("서울 마포구 양화로 160"), if any. */
export function extractStreetAddress(text: string): string | undefined {
  const hangul = /(?:(?:서울|경기|인천|부산|대구|대전|광주|울산|세종)(?:특별시|광역시|특별자치시|도)?\s+)?(?:[가-힣]+구\s+)?(?:[가-힣]+동\s+)?[가-힣]+\d*(?:대로|로|길)\s*\d+(?:-\d+)?/.exec(text);
  if (hangul) return hangul[0].replace(/\s+/g, " ").trim();
  const latin =
    (/\b\d+[\s,]+[a-z]+(?:-[a-z]+)*-(?:ro|gil|daero)\b/i.exec(text)) ??
    (/\b[a-z]+(?:-[a-z]+)*-(?:ro|gil|daero)\s+\d+/i.exec(text));
  return latin ? latin[0].trim() : undefined;
}

export const ROAD_LEVEL_HINT = t("en", "hint.road");

export const DISTRICT_ONLY_HINT = t("en", "hint.district");

export function isStationQuery(query: string): boolean {
  return /station|subway|yeok|역/i.test(query);
}

/**
 * Typo tolerance for place names: short words may be off by one letter,
 * words of 8+ letters by two. Swaps count as one edit (Hongdea, Gangnm, Itaewn). Both sides are compared
 * after lowercasing, so Hangul never fuzzes against Latin.
 */
function fuzzyLimit(token: string): number {
  return token.length >= 8 ? 2 : 1;
}

export function matchPlace(query: string): Place | undefined {
  const full = normalizeSearch(stripStationWords(query));
  const rawFull = ` ${normalizeSearch(query)} `;
  const tokens = full
    .split(" ")
    .filter(
      (token) =>
        token.length >= 2 &&
        !/\d/.test(token) &&
        !PLACE_STOPWORDS.has(token) &&
        !FILTER_TOKENS.has(token),
    );
  if (!full) return undefined;
  let best: { place: Place; score: number } | undefined;
  for (const place of places) {
    let bestForPlace = 0;
    for (const name of place.names) {
      const normalizedName = normalizeSearch(name);
      const romanName = normalizeSearch(romanizeHangul(name));
      if (!normalizedName) continue;
      let score = 0;
      if (normalizedName.length >= 3 && rawFull.includes(` ${normalizedName} `)) {
        // The whole name appears as words ("seoul station" inside a sentence).
        score = 5_000 + normalizedName.length * 10;
      } else if (full === normalizedName || full === romanName) {
        score = 10_000 + normalizedName.length;
      } else if (
        normalizedName.length >= 3 &&
        (full.startsWith(`${normalizedName} `) ||
          full.endsWith(` ${normalizedName}`) ||
          full.includes(` ${normalizedName} `))
      ) {
        score = 5_000 + normalizedName.length * 10;
      } else if (
        full.length >= 3 &&
        (normalizedName.startsWith(`${full} `) || normalizedName.includes(` ${full}`))
      ) {
        score = 1_500 + full.length;
      } else {
        for (const token of tokens) {
          const romanToken = normalizeSearch(romanizeHangul(token));
          if (token === normalizedName || romanToken === romanName) {
            score = Math.max(score, 800 + normalizedName.length);
          } else if (
            token.length >= 3 &&
            (normalizedName.includes(token) || romanName.includes(romanToken))
          ) {
            score = Math.max(score, 400 + token.length + normalizedName.length);
          } else if (
            token.length >= 4 &&
            levenshtein(token, normalizedName) <= fuzzyLimit(token)
          ) {
            score = Math.max(score, 300);
          } else if (
            romanToken.length >= 4 &&
            levenshtein(romanToken, romanName) <= fuzzyLimit(romanToken)
          ) {
            score = Math.max(score, 300);
          }
        }
      }
      bestForPlace = Math.max(bestForPlace, score);
    }
    if (bestForPlace && (!best || bestForPlace > best.score)) {
      best = { place, score: bestForPlace };
    }
  }
  return best?.place;
}

function nameSpecificity(name: string): number {
  const lower = name.toLowerCase();
  if (lower.endsWith("입구")) return 1;
  if (lower.endsWith("구") || lower.endsWith("-gu")) return 0;
  if (lower.endsWith("동") || lower.endsWith("-dong")) return 2;
  return 1;
}

/** Prefer 마곡동 over 강서구 so district catalog entries do not relabel neighborhoods. */
export function matchPlaceInAddress(address: string): Place | undefined {
  if (!address) return undefined;
  const lower = address.toLowerCase();
  let best: { place: Place; rank: number; length: number } | undefined;
  for (const place of places) {
    for (const name of place.names) {
      const hangul = /[가-힣]/.test(name);
      const hit = hangul ? address.includes(name) : lower.includes(name.toLowerCase());
      if (!hit) continue;
      const rank = nameSpecificity(name);
      const length = name.length;
      if (!best || rank > best.rank || (rank === best.rank && length > best.length)) {
        best = { place, rank, length };
      }
    }
  }
  return best?.place;
}

/** Stations keep a walk radius; 구-scale searches use the map viewport instead. */
export function circleForPlaceSearch(
  place: Place,
  query: string,
  radiusM: number,
): CircleFilter | null {
  if (isStationQuery(query) || place.radiusM) {
    return { lat: place.lat, lng: place.lng, radiusM: place.radiusM ?? 800 };
  }
  if (place.zoom <= 14) return null;
  return { lat: place.lat, lng: place.lng, radiusM };
}

const FILTER_TOKENS = new Set(
  [
    ...Object.keys(SYNONYMS),
    ...Object.values(SYNONYMS).flat(),
    "oneroom",
    "one-room",
    "studio",
    "villa",
    "officetel",
    "apartment",
    "jeonse",
    "wolse",
    "monthly",
    "sale",
    "deposit",
    "rent",
    "budget",
    "million",
    "under",
    "max",
    "min",
    "보증금",
    "월세",
    "만원",
  ].map(normalizeSearch),
);

const PLACE_STOPWORDS = new Set(
  [
    "i",
    "im",
    "i'm",
    "id",
    "want",
    "wanted",
    "looking",
    "need",
    "needs",
    "find",
    "search",
    "show",
    "get",
    "please",
    "something",
    "somewhere",
    "maybe",
    "around",
    "near",
    "nearby",
    "close",
    "in",
    "at",
    "to",
    "with",
    "and",
    "or",
    "my",
    "me",
    "us",
    "we",
    "for",
    "a",
    "an",
    "the",
    "of",
    "on",
    "by",
    "from",
    "no",
    "not",
    "without",
    "exclude",
    "any",
    "cheap",
    "cheaper",
    "bit",
    "foreigner",
    "foreigners",
    "welcome",
    "accepts",
    "landlord",
    "recommend",
    "recommended",
    "best",
    "value",
    "korea",
    "seoul",
    "place",
    "home",
    "homes",
    "room",
    "rooms",
    "listing",
    "listings",
    "this",
    "week",
    "month",
    "days",
    "new",
    "recent",
    "fresh",
    "근처",
    "friendly",
    "some",
    "good",
    "great",
    "nice",
    "places",
    "place",
    "less",
    "than",
    "years",
    "year",
    "old",
    "older",
    "newer",
    "built",
    "age",
    "value",
    "find",
    "decent",
    "photos",
    "photo",
    "that",
    "are",
    "is",
    "be",
    // Ask phrasing that is never a place name.
    "newest",
    "newer",
    "building",
    "buildings",
    "yrs",
    "yr",
    "bedroom",
    "bedrooms",
    "bed",
    "beds",
    "투룸",
    "쓰리룸",
    "이하",
    "이상",
    "미만",
    "이내",
    "max",
    "maximum",
    "min",
    "minimum",
    "over",
    "above",
    "below",
    "least",
    "most",
    "k",
    "weather",
    "what",
    "whats",
    "how",
    "who",
    "when",
    "where",
    "why",
    "tell",
    "joke",
    "hello",
    "hi",
    "thanks",
  ].map(normalizeSearch),
);

export function isListingFilterToken(token: string): boolean {
  const normalized = normalizeSearch(token);
  if (!normalized || /^\d+$/.test(normalized)) return false;
  // "complex" / 단지 show up in station names (Guro Digital Complex), not as a type filter.
  if (normalized === "complex" || normalized === "단지") return false;
  if (FILTER_TOKENS.has(normalized)) return true;
  return expandQuery(normalized).some(
    (variant) =>
      variant !== "complex" &&
      variant !== "단지" &&
      FILTER_TOKENS.has(variant),
  );
}

/** Words Ask may carry into the box to match listing titles. */
export function isAskListingToken(token: string): boolean {
  const normalized = normalizeSearch(token);
  return (
    normalized === "rooftop" ||
    normalized === "옥탑" ||
    normalized === "oktap" ||
    isDescriptiveListingToken(token)
  );
}

const AMENITY_TOKENS = new Set(
  [
    "pet",
    "pets",
    "furnished",
    "parking",
    "duplex",
    "loft",
    "terrace",
    "balcony",
    "short-term",
    "shortterm",
  ].map(normalizeSearch),
);

/** Leftover amenity words that should match listing titles (pet, furnished). */
export function isDescriptiveListingToken(token: string): boolean {
  const normalized = normalizeSearch(token);
  if (!normalized || normalized.length < 3 || /^\d+$/.test(normalized)) return false;
  if (PLACE_STOPWORDS.has(normalized)) return false;
  if (normalized === "complex" || normalized === "단지") return false;
  if (isListingFilterToken(normalized)) return false;
  return AMENITY_TOKENS.has(normalized);
}

export function looksLikePlaceQuery(query: string): boolean {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (!tokens.length) return false;
  return tokens.some(
    (token) =>
      token.length >= 2 &&
      !FILTER_TOKENS.has(token) &&
      !PLACE_STOPWORDS.has(token) &&
      !/^\d+$/.test(token),
  );
}

export function listingFilterQuery(query: string, place?: Place): string {
  const { rest: afterFloor } = parseFloorFilter(query);
  const { rest } = parseAgeFilter(afterFloor);
  const afterPlace = place ? stripPlaceFromQuery(rest, place) : rest;
  return stripStationWords(afterPlace)
    .split(/\s+/)
    .filter((token) => isListingFilterToken(token) || isDescriptiveListingToken(token))
    .join(" ");
}

function isPlaceQueryToken(token: string): boolean {
  const normalized = normalizeSearch(token);
  if (!normalized || PLACE_STOPWORDS.has(normalized)) return false;
  if (!/\p{L}/u.test(normalized) || /\d/.test(normalized)) return false;
  return !isListingFilterToken(normalized) && !isDescriptiveListingToken(normalized);
}

export function unrefinedPlaceLeftover(query: string, place: Place): string {
  const { rest: afterFloor } = parseFloorFilter(query);
  const { rest } = parseAgeFilter(afterFloor);
  return stripStationWords(stripPlaceFromQuery(rest, place))
    .split(/\s+/)
    .filter(isPlaceQueryToken)
    .join(" ");
}

export function placeSearchToken(query: string): string | undefined {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  return tokens.find((token) => looksLikePlaceQuery(token));
}

export function stripPlaceFromQuery(query: string, place: Place): string {
  let rest = query;
  for (const name of [...place.names].sort((a, b) => b.length - a.length)) {
    rest = rest.replace(
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
      " ",
    );
  }
  // A misspelled place word ("Hongdea") must not survive as leftover text.
  const names = place.names
    .map((name) => normalizeSearch(name))
    .filter((name) => name.length >= 4 && !/[가-힣]/.test(name));
  rest = rest
    .split(/\s+/)
    .filter((token) => {
      const t = normalizeSearch(token);
      if (t.length < 4 || /\d/.test(t) || /[가-힣]/.test(t)) return true;
      return !names.some((name) => levenshtein(t, name) <= fuzzyLimit(t));
    })
    .join(" ");
  return rest.replace(/\s+/g, " ").trim();
}

export function parseSearchQuery(query: string): {
  place?: Place;
  listingQuery: string;
  floorFilter?: FloorFilter;
  ageFilter?: AgeFilter;
} {
  const { floorFilter, rest: afterFloor } = parseFloorFilter(query);
  const { ageFilter } = parseAgeFilter(afterFloor);
  const place = matchPlace(query);
  return {
    place,
    listingQuery: listingFilterQuery(query, place),
    floorFilter,
    ageFilter,
  };
}
