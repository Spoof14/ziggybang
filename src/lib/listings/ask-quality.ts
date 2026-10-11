/**
 * Ask result quality helpers (pure, shared by server + client): room counts,
 * floor/size classes, duplicate collapsing, honest area labels, grounding of
 * AI reasons, and the deterministic summary.
 */
import { placeEn, placeKo, places } from "~/lib/geo/places";
import { distanceM } from "~/lib/geo/shape";
import { DEFAULT_LANG, t, tn, type Lang } from "~/lib/i18n";
import { formatKrwFromManwon, formatFloor } from "./copy";
import { englishDistrict, englishNeighborhood, koreanNeighborhood } from "./english";
import { type MapListing } from "./types";

/** Deposit → monthly conversion used when comparing "cheap" homes (5% a year). */
export const DEPOSIT_CONVERSION_RATE = 0.05;

/** Rent + maintenance + deposit × 5%/12, in 만원 per month. */
export function effectiveMonthlyManwon(l: MapListing): number | null {
  const manage = l.manageCost ?? 0;
  const monthlyOfDeposit = (DEPOSIT_CONVERSION_RATE / 12);
  if (l.salesType === "sale") {
    return l.price == null ? null : l.price * (0.04 / 12) + manage;
  }
  if (l.deposit == null && l.rent == null) return null;
  const deposit = l.deposit ?? 0;
  if (l.salesType === "jeonse" || (l.rent == null && l.deposit != null)) return deposit * monthlyOfDeposit + manage;
  return (l.rent ?? 0) + manage + deposit * monthlyOfDeposit;
}

// ------------------------------------------------------------------- rooms

const ROOM_WORDS: Array<[RegExp, number]> = [
  [/포룸|4\s*룸|four[- ]?room|\b4[- ]?(?:bed(?:room)?s?|br|rooms?)\b|방\s*(?:4|네)\s*개/i, 4],
  [/쓰리룸|3\s*룸|three[- ]?room|\b(?:3|three)[- ]?(?:bed(?:room)?s?|br|rooms?)\b|방\s*(?:3|세)\s*개/i, 3],
  [/투룸|2\s*룸|two[- ]?room|\b(?:2|two)[- ]?(?:bed(?:room)?s?|br|rooms?)\b|방\s*(?:2|두)\s*개/i, 2],
];

/** Room count asked for in free text; only 2+ rooms (one-room is the "studio" type). */
export function detectRoomCount(text: string): number | undefined {
  for (const [pattern, rooms] of ROOM_WORDS) if (pattern.test(text)) return rooms;
  return undefined;
}

/** Room count a listing states in roomType or title; undefined when the data doesn't say. */
export function listingRooms(l: MapListing): number | undefined {
  const roomType = l.roomType ?? "";
  if (/원룸|오픈형|분리형|복층|studio/i.test(roomType) && !/투룸|쓰리룸|2룸|3룸/.test(roomType)) return 1;
  const fromType = detectRoomCount(roomType);
  if (fromType) return fromType;
  const fromTitle = detectRoomCount(l.title ?? "");
  if (fromTitle) return fromTitle;
  return undefined;
}

export function roomsLabel(rooms: number, lang: Lang = DEFAULT_LANG): string {
  if (rooms >= 2 && rooms <= 4) return t(lang, `ask.rooms.${rooms}` as "ask.rooms.2");
  return t(lang, "ask.rooms.n", { n: rooms });
}

export const ROOMS_APPROX_NOTE = t("en", "ask.assume.rooms");

// ------------------------------------------------------------ floor and size

export type FloorKind = "semi-basement" | "basement" | "rooftop" | "normal";

export function floorKind(floor?: string): FloorKind {
  if (!floor) return "normal";
  const compact = floor.replace(/\s+/g, "");
  if (/반지하|반지층|semi/i.test(compact)) return "semi-basement";
  if (/옥탑|rooftop/i.test(compact)) return "rooftop";
  if (/^(지하|B-?\d)|basement/i.test(compact)) return "basement";
  return "normal";
}

export const BASEMENT_OR_ROOFTOP_WORDS = /반지하|반지층|지하|옥탑|basement|semi-?basement|rooftop|roof\s*top|penthouse/i;
export const CHEAP_WORDS = /\b(cheap|cheapest|affordable|budget|low[- ]cost|inexpensive|save)\b|저렴|싼|가성비/i;

export type SizeClass = "tiny" | "small" | "medium" | "large" | "very large";

/** Size buckets from the real m² (Korean one-rooms are mostly 10–25 m²). */
export function sizeClass(m2?: number): SizeClass | undefined {
  if (m2 == null || !Number.isFinite(m2) || m2 <= 0) return undefined;
  if (m2 < 15) return "tiny";
  if (m2 < 23) return "small";
  if (m2 < 33) return "medium";
  if (m2 < 50) return "large";
  return "very large";
}

// --------------------------------------------------------------- duplicates

function sameNumber(a: number | undefined, b: number | undefined, tolerance: number): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= tolerance;
}

/**
 * Same complex (within 15 m), same deal and type, and the same price/size give
 * or take a rounding (area ±1.5 m², rent ±₩10,000, deposit ±3%).
 */
export function isNearDuplicate(a: MapListing, b: MapListing): boolean {
  if (a.propertyType !== b.propertyType || a.salesType !== b.salesType) return false;
  if (distanceM(a, b) > 15) return false;
  if (!sameNumber(a.areaM2, b.areaM2, 1.5)) return false;
  if (!sameNumber(a.rent, b.rent, 1) || !sameNumber(a.price, b.price, (a.price ?? 0) * 0.03)) return false;
  return sameNumber(a.deposit, b.deposit, Math.max(a.deposit ?? 0, b.deposit ?? 0) * 0.03);
}

function floorKey(l: MapListing): string {
  return formatFloor(l.floor) ?? "";
}

/** id → id of the first listing of its near-duplicate group. */
export function nearGroups(listings: MapListing[]): Map<string, string> {
  const leaders: MapListing[] = [];
  const groups = new Map<string, string>();
  for (const l of listings) {
    const leader = leaders.find((candidate) => isNearDuplicate(candidate, l));
    if (leader) groups.set(l.id, leader.id);
    else {
      leaders.push(l);
      groups.set(l.id, l.id);
    }
  }
  return groups;
}

export const MAX_NEAR_DUPLICATES = 2;

/**
 * Collapse exact repeats (near-duplicates with the same floor text) into one
 * entry, keeping the better one (photo first, then input order). Survivors keep
 * input order. `groupSize` counts every member per near-duplicate group so a
 * card can say "+N similar".
 */
export function collapseDuplicates<T extends { listing: MapListing }>(
  items: T[],
): { items: T[]; groups: Map<string, string>; groupSize: Map<string, number> } {
  const groups = nearGroups(items.map((i) => i.listing));
  const groupSize = new Map<string, number>();
  const byUnit = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const group = groups.get(item.listing.id)!;
    groupSize.set(group, (groupSize.get(group) ?? 0) + 1);
    const unit = `${group}|${floorKey(item.listing)}`;
    const seenAt = byUnit.get(unit);
    if (seenAt == null) {
      byUnit.set(unit, out.length);
      out.push(item);
      continue;
    }
    const kept = out[seenAt]!;
    if (!hasAnyPhoto(kept.listing) && hasAnyPhoto(item.listing)) out[seenAt] = item;
  }
  return { items: out, groups, groupSize };
}

/** Keep at most `cap` per near-duplicate group; the rest follow after everyone else. */
export function diversify<T extends { listing: MapListing }>(
  items: T[],
  groups: ReadonlyMap<string, string>,
  cap = MAX_NEAR_DUPLICATES,
): T[] {
  const counts = new Map<string, number>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const key = groups.get(item.listing.id) ?? item.listing.id;
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    (n < cap ? first : rest).push(item);
  }
  return [...first, ...rest];
}

export function hasAnyPhoto(l: Pick<MapListing, "thumbnail" | "photos">): boolean {
  return (l.thumbnail?.trim().length ?? 0) > 0 || Boolean(l.photos?.some((u) => u.trim().length > 0));
}

// -------------------------------------------------------------- area labels

const LANDMARKS = places.filter((p) => p.zoom >= 15 && !p.districtOnly);

/**
 * "Hongdae" only when the home really is near it: the nearest named place within
 * 700 m wins over a looser address match; else the neighbourhood/district text.
 */
export function areaLabel(
  l: Pick<MapListing, "lat" | "lng" | "address">,
  lang: Lang = DEFAULT_LANG,
): string | null {
  let best: { place: (typeof LANDMARKS)[number]; d: number } | undefined;
  for (const p of LANDMARKS) {
    const d = distanceM(l, p);
    if (d <= 700 && (!best || d < best.d)) best = { place: p, d };
  }
  if (lang === "ko") {
    if (best) return t(lang, "ask.area.near", { name: placeKo(best.place) });
    return koreanAddressForArea(l.address);
  }
  const district = englishDistrict(l.address);
  if (best) return t(lang, "ask.area.near", { name: placeEn(best.place) });
  const hood = englishNeighborhood(l.address);
  if (hood && district) return `${hood} · ${district}`;
  return hood ?? district ?? null;
}

function koreanAddressForArea(address?: string): string | null {
  const hood = koreanNeighborhood(address);
  const district = address?.match(/[가-힣]+구/)?.[0];
  if (hood && district) return hood === district.replace(/구$/, "") ? district : `${hood} · ${district}`;
  return hood ?? district ?? null;
}

// ------------------------------------------------------------- AI grounding

/**
 * A reason may only state facts the candidate has. Returns false when it names a
 * build year, subway time, elevator, quiet, parking or floor the data lacks.
 */
export function reasonIsGrounded(
  reason: string,
  facts: {
    builtYear?: number;
    subwayWalkMin?: number;
    tags: string[];
    floor?: string;
    m2?: number;
  },
): boolean {
  const r = reason.toLowerCase();
  if (/\b(built|constructed)\b|\bnewly built\b|\bnew building\b|\byears? old\b|\byrs? old\b|\bnewer\b|준공|신축|년차|연식/.test(r) && facts.builtYear == null) return false;
  const builtYear = /\b(?:built|from|in)\s+((?:19|20)\d{2})\b|((?:19|20)\d{2})\s*년\s*(?:준공|건축|사용승인)/.exec(r);
  const claimedYear = builtYear?.[1] ?? builtYear?.[2];
  if (claimedYear && facts.builtYear != null && Number(claimedYear) !== facts.builtYear) return false;
  if (/subway|metro|\bwalk|지하철|역세권|도보/.test(r) && facts.subwayWalkMin == null) return false;
  if (/elevator|엘리베이터|엘베/.test(r) && !facts.tags.includes("elevator")) return false;
  if (/quiet|calm|peaceful|조용|한적/.test(r) && !facts.tags.includes("quiet")) return false;
  if (/parking|주차/.test(r) && !facts.tags.includes("parking")) return false;
  if (/furnished|full[- ]option|풀옵션|옵션/.test(r) && !facts.tags.includes("furnished")) return false;
  if (/\bpet|반려|애완/.test(r) && !facts.tags.includes("pet")) return false;
  if (/\bfloor\b|rooftop|basement|층|옥탑|반지하/.test(r) && !facts.floor) return false;
  if (/spacious|roomy|large\b|넓/.test(r) && !(facts.m2 != null && facts.m2 >= 33)) return false;
  return true;
}

// --------------------------------------------------------- deterministic text

function rangeText(values: number[], fmt: (n: number) => string | null): string | null {
  if (!values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const a = fmt(lo);
  const b = fmt(hi);
  if (!a || !b) return null;
  return lo === hi ? a : `${a}–${b.replace("₩", "")}`;
}

/** Summary built from the final constraints and the picks (never from stale text). */
export function buildAskSummary(input: {
  count: number;
  candidates: number;
  placeName?: string;
  typeWord: string;
  deals: Array<"jeonse" | "wolse" | "sale">;
  rooms?: number;
  picks: MapListing[];
  cheap?: boolean;
  lang?: Lang;
}): string {
  const lang = input.lang ?? DEFAULT_LANG;
  const { picks } = input;
  const dealKey = { jeonse: "ask.sum.dealJeonse", wolse: "ask.sum.dealWolse", sale: "ask.sum.dealSale" } as const;
  const dealWord = input.deals.length === 1 ? t(lang, dealKey[input.deals[0]!]) : "";
  const roomWord =
    input.rooms && input.rooms >= 2 && input.rooms <= 4
      ? t(lang, (["", "", "ask.room.two", "ask.room.three", "ask.room.four"] as const)[input.rooms] as "ask.room.two")
      : "";
  const what = [dealWord, roomWord, input.typeWord].filter(Boolean).join(" ");
  const bits: string[] = [];
  const rents = picks.filter((p) => p.salesType === "wolse" && p.rent != null).map((p) => p.rent!);
  const deposits = picks.filter((p) => p.deposit != null && p.salesType !== "sale").map((p) => p.deposit!);
  const money = (n: number) => formatKrwFromManwon(n, lang);
  const rent = rangeText(rents, money);
  const dep = rangeText(deposits, money);
  if (rent) bits.push(t(lang, "ask.sum.rent", { v: rent }));
  const depKey = input.deals.includes("jeonse") && !rents.length ? "ask.sum.jeonse" : "ask.sum.deposit";
  if (dep) bits.push(t(lang, depKey, { v: dep }));
  const areas = picks.map((p) => p.areaM2).filter((v): v is number => typeof v === "number");
  if (areas.length) {
    bits.push(t(lang, "area.m2", { m2: `${Math.round(Math.min(...areas))}–${Math.round(Math.max(...areas))}` }));
  }
  const tail = bits.length ? `: ${bits.join(", ")}` : "";
  const cheapTail = input.cheap ? t(lang, "ask.sum.cheap") : "";
  if (lang === "ko") {
    const where = input.placeName ? t(lang, "ask.sum.near", { place: input.placeName }) : "";
    const head = t(lang, "ask.sum.head", {
      count: input.count,
      what,
      where,
      candidates: input.candidates,
      matchWord: tn(lang, "ask.sum.match", input.candidates),
    });
    return `${head}${tail}${cheapTail}.`.replace("..", ".");
  }
  const where = input.placeName ? t(lang, "ask.sum.near", { place: input.placeName }) : "";
  const head = t(lang, "ask.sum.head", {
    count: input.count,
    what,
    plural: input.count === 1 ? "" : "s",
    where,
    candidates: input.candidates,
    matchWord: tn(lang, "ask.sum.match", input.candidates),
  });
  return `${head}${tail}${cheapTail}.`.replace("..", ".");
}

export { formatFloor };
