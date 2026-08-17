import { places, type Place } from "~/lib/geo/places";
import {
  formatRoomType,
  propertyTypeLabel,
  salesTypeFilterLabel,
  salesTypeLabel,
  sourceLabel,
} from "./copy";
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

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = current;
    }
  }
  return row[b.length]!;
}

export function fuzzyIncludes(haystack: string, needle: string): boolean {
  const h = normalizeSearch(haystack);
  const n = normalizeSearch(needle);
  if (!n) return true;
  if (!h) return false;
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

export function matchPlace(query: string): Place | undefined {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (!tokens.length) return undefined;
  let best: { place: Place; score: number } | undefined;
  for (const place of places) {
    for (const name of place.names) {
      const normalizedName = normalizeSearch(name);
      const romanName = normalizeSearch(romanizeHangul(name));
      for (const token of tokens) {
        const romanToken = normalizeSearch(romanizeHangul(token));
        let score = 0;
        if (token === normalizedName || romanToken === romanName) score = 100 + name.length;
        else if (normalizedName.includes(token) || romanName.includes(romanToken)) {
          score = 60 + token.length;
        } else if (token.length >= 4 && levenshtein(token, normalizedName) <= 1) {
          score = 50;
        } else if (
          romanToken.length >= 4 &&
          levenshtein(romanToken, romanName) <= 1
        ) {
          score = 50;
        }
        if (score && (!best || score > best.score)) {
          best = { place, score };
        }
      }
    }
  }
  return best?.place;
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
  ].map(normalizeSearch),
);

export function looksLikePlaceQuery(query: string): boolean {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (!tokens.length) return false;
  return tokens.some((token) => token.length >= 2 && !FILTER_TOKENS.has(token));
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
  return rest.replace(/\s+/g, " ").trim();
}

export function parseSearchQuery(query: string): {
  place?: Place;
  listingQuery: string;
} {
  const place = matchPlace(query);
  if (!place) return { listingQuery: query.trim() };
  return { place, listingQuery: stripPlaceFromQuery(query, place) };
}
