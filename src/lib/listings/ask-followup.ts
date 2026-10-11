/**
 * Ask follow-ups: commute-time parsing/estimates, "Similar to this" anchors,
 * ordinal references to earlier picks ("the second one but cheaper").
 * Pure and shared by server and client.
 */
import { distanceM } from "~/lib/geo/shape";
import { areaBuckets, type AreaBucketId } from "./area";
import { type AskConstraints } from "./ask-picks";
import { type ListingDetail, type MapListing } from "./types";

export type AskCommute = {
  /** Destination as the user named it ("Gangnam"). */
  name: string;
  lat: number;
  lng: number;
  /** Door-to-door minutes the user is willing to spend (approximate). */
  maxMin: number;
};

export type SimilarAnchor = { id: string; label: string };

/** Compact description of an earlier pick, sent with a follow-up so "the second one" resolves. */
export type PriorPick = {
  rank: number;
  id: string;
  propertyType: MapListing["propertyType"];
  salesType?: MapListing["salesType"];
  deposit?: number;
  rent?: number;
  price?: number;
  areaM2?: number;
  lat: number;
  lng: number;
  label: string;
};

/** Door-to-door: ~8 min to walk/wait plus ~3 min per straight-line km (detours + transfers). Always "approx.". */
export const COMMUTE_BASE_MIN = 8;
export const COMMUTE_MIN_PER_KM = 3;
export const MAX_COMMUTE_RADIUS_M = 4000;

export function approxCommuteMin(meters: number): number {
  const minutes = COMMUTE_BASE_MIN + (Math.max(0, meters) / 1000) * COMMUTE_MIN_PER_KM;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** Straight-line distance that still fits in `maxMin`. */
export function commuteRadiusM(maxMin: number): number {
  return Math.max(0, ((maxMin - COMMUTE_BASE_MIN) / COMMUTE_MIN_PER_KM) * 1000);
}

export function commuteMinutesFor(listing: { lat: number; lng: number }, c: AskCommute): number {
  return approxCommuteMin(distanceM(listing, c));
}

const TRAILING_STATION = /\s*(?:station|stn\.?|역)\s*$/i;

function cleanDestination(raw: string): string {
  return raw
    .replace(/^[\s,]*(?:the|to|from|of)\s+/i, "")
    .replace(/[?.!,]+$/g, "")
    .replace(/\b(?:by|via)\s+(?:subway|metro|transit|bus|train)\b.*$/i, "")
    .replace(/\b(?:under|below|less than|max(?:imum)?|around|with|and|that|which|for|please)\b.*$/i, "")
    .replace(TRAILING_STATION, "")
    .trim()
    .slice(0, 40);
}

const MIN = String.raw`(\d{1,3})\s*(?:-?\s*)(?:min(?:ute)?s?|분)`;

/**
 * "within 30 min of Gangnam Station", "30 minutes to Seoul Station",
 * "commute to Samsung under 25 min", "강남역까지 30분 이내".
 */
export function parseCommute(text: string): { destination: string; maxMin: number } | null {
  const patterns: Array<{ re: RegExp; min: number; dest: number }> = [
    { re: new RegExp(String.raw`(?:within|under|less than|max(?:imum)?(?: of)?|up to|<=?|≤)\s*${MIN}\s*(?:commute\s*)?(?:of|from|to|away from|by (?:subway|transit|metro) (?:to|from))\s+([^,.;?!]+)`, "i"), min: 1, dest: 2 },
    { re: new RegExp(String.raw`${MIN}\s*(?:commute\s*)?(?:or less\s*)?(?:to|from|of)\s+([^,.;?!]+)`, "i"), min: 1, dest: 2 },
    { re: new RegExp(String.raw`(?:commute|travel|get)\s+(?:time\s+)?(?:to|from)\s+([^,.;?!]+?)\s+(?:under|within|in|less than|<=?|≤)\s*${MIN}`, "i"), min: 2, dest: 1 },
    { re: new RegExp(String.raw`([가-힣A-Za-z0-9 ]{2,20}?)(?:역)?\s*(?:까지|에서)\s*(?:통근|출근|이동)?\s*${MIN}\s*(?:이내|안|내)?`, "i"), min: 2, dest: 1 },
    { re: new RegExp(String.raw`${MIN}\s*(?:이내|안에)\s*(?:로\s*)?([가-힣A-Za-z0-9 ]{2,20})`, "i"), min: 1, dest: 2 },
  ];
  for (const { re, min, dest } of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const maxMin = Number(m[min]);
    const destination = cleanDestination(m[dest] ?? "");
    if (!Number.isFinite(maxMin) || maxMin < 5 || maxMin > 90 || destination.length < 2) continue;
    return { destination, maxMin };
  }
  return null;
}

// ----------------------------------------------------------------- ordinals

const ORDINALS: Array<[RegExp, number]> = [
  [/(?:\b(?:first|1st|no\.?\s*1)\b|#1\b)|첫\s*번째|첫째|1번/i, 1],
  [/(?:\b(?:second|2nd|no\.?\s*2)\b|#2\b)|두\s*번째|둘째|2번/i, 2],
  [/(?:\b(?:third|3rd|no\.?\s*3)\b|#3\b)|세\s*번째|셋째|3번/i, 3],
  [/(?:\b(?:fourth|4th|no\.?\s*4)\b|#4\b)|네\s*번째|넷째|4번/i, 4],
  [/(?:\b(?:fifth|5th|no\.?\s*5)\b|#5\b)|다섯\s*번째|5번/i, 5],
  [/(?:\b(?:sixth|6th)\b|#6\b)|여섯\s*번째|6번/i, 6],
  [/(?:\b(?:seventh|7th)\b|#7\b)|일곱\s*번째|7번/i, 7],
  [/(?:\b(?:eighth|8th)\b|#8\b)|여덟\s*번째|8번/i, 8],
  [/(?:\b(?:ninth|9th)\b|#9\b)|아홉\s*번째|9번/i, 9],
  [/(?:\b(?:tenth|10th)\b|#10\b)|열\s*번째|10번/i, 10],
];

/** "the second one", "#3", "두 번째 매물" → 2 / 3. Requires a reference word so "2 rooms" is not an ordinal. */
export function parseOrdinalRef(text: string): number | null {
  const refers = /\b(?:one|pick|home|place|listing|option|result|number|no\.?)\b|#\d+|매물|번째|번\b/i.test(text);
  if (!refers) return null;
  for (const [re, n] of ORDINALS) if (re.test(text)) return n;
  return null;
}

export function priorPickFromListing(rank: number, l: MapListing & Partial<ListingDetail>, label: string): PriorPick {
  return {
    rank,
    id: l.id,
    propertyType: l.propertyType,
    salesType: l.salesType,
    deposit: l.deposit,
    rent: l.rent,
    price: l.price,
    areaM2: l.areaM2,
    lat: l.lat,
    lng: l.lng,
    label: label.slice(0, 60),
  };
}

// ------------------------------------------------------------ anchor search

function bucketForArea(areaM2: number): AreaBucketId {
  // Buckets are ordered smallest → largest.
  const found = areaBuckets.find((b) => areaM2 >= b.minM2 && (b.maxM2 == null || areaM2 < b.maxM2));
  return (found ?? areaBuckets[areaBuckets.length - 1]!).id;
}

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

/**
 * Constraints for "homes like this one": same area (1 km), same deal and
 * property type, similar price (±20%) and size bucket. The anchor itself is excluded.
 */
export function similarConstraints(
  anchor: Pick<PriorPick, "id" | "propertyType" | "salesType" | "deposit" | "rent" | "price" | "areaM2" | "lat" | "lng" | "label">,
): AskConstraints {
  const c: AskConstraints = {
    place: { name: anchor.label, lat: anchor.lat, lng: anchor.lng, radiusM: 1000, kind: "place" },
    propertyTypes: [anchor.propertyType],
    similarTo: { id: anchor.id, label: anchor.label },
  };
  if (anchor.salesType) c.salesTypes = [anchor.salesType];
  if (anchor.salesType === "wolse") {
    if (anchor.rent != null) {
      c.minRent = round5(anchor.rent * 0.8);
      c.maxRent = round5(anchor.rent * 1.2 + 4);
    }
    if (anchor.deposit != null) {
      c.maxDeposit = round5(Math.max(anchor.deposit * 1.5, anchor.deposit + 500));
    }
  } else if (anchor.salesType === "jeonse" && anchor.deposit != null) {
    c.minDeposit = round5(anchor.deposit * 0.8);
    c.maxDeposit = round5(anchor.deposit * 1.2 + 4);
  }
  if (anchor.areaM2) c.areaBucketIds = [bucketForArea(anchor.areaM2)];
  return c;
}

/** Wording that adjusts an anchor ("but cheaper", "bigger", "closer to the subway", "newer"). */
export function anchorAdjustments(text: string): { cheaper: boolean; bigger: boolean; newer: boolean; subway: boolean } {
  return {
    cheaper: /\b(cheaper|less expensive|lower|budget)\b|저렴|싼/i.test(text),
    bigger: /\b(bigger|larger|more spacious|roomier)\b|넓/i.test(text),
    newer: /\b(newer|more modern)\b|신축|새\s*건물/i.test(text),
    subway: /\b(subway|metro|station|transit)\b|지하철|역세권/i.test(text),
  };
}

/** "The second one but cheaper": anchor constraints with the requested tweaks applied. */
export function anchoredFollowup(anchor: PriorPick, text: string, previous?: AskConstraints): AskConstraints {
  const base = similarConstraints(anchor);
  const adj = anchorAdjustments(text);
  const next: AskConstraints = { ...base };
  if (adj.cheaper) {
    delete next.minRent;
    delete next.minDeposit;
    if (anchor.salesType === "wolse" && anchor.rent != null) {
      next.maxRent = Math.max(5, round5(anchor.rent * 0.9 - 1));
      if (anchor.deposit != null) next.maxDeposit = round5(anchor.deposit);
    } else if (anchor.deposit != null) {
      next.maxDeposit = Math.max(5, round5(anchor.deposit * 0.9 - 1));
    }
  }
  if (adj.bigger && anchor.areaM2) {
    const idx = areaBuckets.findIndex((b) => b.id === bucketForArea(anchor.areaM2!));
    next.areaBucketIds = areaBuckets.slice(Math.min(idx + 1, areaBuckets.length - 1)).map((b) => b.id);
  }
  const prefs = new Set(previous?.preferences ?? []);
  if (adj.newer) prefs.add("newer building");
  if (adj.subway) prefs.add("close to subway");
  if (prefs.size) next.preferences = [...prefs].slice(0, 5);
  if (previous?.commute) next.commute = previous.commute;
  return next;
}

/** Short name for an anchor listing ("Hongdae", "홍대입구"): the landmark/neighborhood without the "Near …" wrapper. */
export function stripNearWrapper(label: string): string {
  return label.replace(/^Near\s+/i, "").replace(/\s*근처$/, "").trim();
}

/** Messages the follow-up chips send. Always English phrases: the parser understands them in either UI language. */
export const FOLLOWUP_CHIPS = [
  { key: "cheaper", message: "cheaper", label: "ask.fu.cheaper" },
  { key: "newer", message: "newer building", label: "ask.fu.newer" },
  { key: "bigger", message: "bigger", label: "ask.fu.bigger" },
  { key: "subway", message: "closer to subway", label: "ask.fu.subway" },
] as const;
