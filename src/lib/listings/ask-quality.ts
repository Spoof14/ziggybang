/**
 * Ask result quality helpers (pure, shared by server + client): room counts,
 * floor/size classes, duplicate collapsing, honest area labels, grounding of
 * AI reasons, and the deterministic summary.
 */
import { places } from "~/lib/geo/places";
import { distanceM } from "~/lib/geo/shape";
import { formatKrwFromManwon, formatFloor } from "./copy";
import { englishDistrict, englishNeighborhood } from "./english";
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

export function roomsLabel(rooms: number): string {
  const word = rooms === 2 ? "Two" : rooms === 3 ? "Three" : rooms === 4 ? "Four" : String(rooms);
  return `${word}-room (best effort)`;
}

export const ROOMS_APPROX_NOTE =
  "Room count is approximate: listings rarely state it, so I used the layout/title text where present.";

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

function money(v: number | undefined | null): string {
  return v == null ? "" : String(v);
}

/** Same building / price / size, any floor. */
export function nearDuplicateKey(l: MapListing): string {
  return [
    l.propertyType,
    l.lat.toFixed(4),
    l.lng.toFixed(4),
    l.salesType ?? "",
    money(l.deposit),
    money(l.rent),
    money(l.price),
    l.areaM2 == null ? "" : Math.round(l.areaM2),
  ].join("|");
}

/** Near-duplicate plus the same floor text: the same unit listed again. */
export function exactDuplicateKey(l: MapListing): string {
  return `${nearDuplicateKey(l)}|${(l.floor ?? "").replace(/\s+/g, "")}`;
}

export const MAX_NEAR_DUPLICATES = 2;

/**
 * Collapse exact repeats (same complex, price, size and floor text) into one
 * entry, keeping the better one (photo first, then input order). Order of the
 * survivors follows the input. `similarOf` counts every dropped or capped
 * sibling per near-duplicate group so a card can say "+N similar".
 */
export function collapseDuplicates<T extends { listing: MapListing }>(
  items: T[],
): { items: T[]; groupSize: Map<string, number> } {
  const groupSize = new Map<string, number>();
  const byExact = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const near = nearDuplicateKey(item.listing);
    groupSize.set(near, (groupSize.get(near) ?? 0) + 1);
    const exact = exactDuplicateKey(item.listing);
    const seenAt = byExact.get(exact);
    if (seenAt == null) {
      byExact.set(exact, out.length);
      out.push(item);
      continue;
    }
    const kept = out[seenAt]!;
    if (!hasAnyPhoto(kept.listing) && hasAnyPhoto(item.listing)) out[seenAt] = item;
  }
  return { items: out, groupSize };
}

/** Keep at most `cap` per near-duplicate group; the rest follow after everyone else. */
export function diversify<T extends { listing: MapListing }>(items: T[], cap = MAX_NEAR_DUPLICATES): T[] {
  const counts = new Map<string, number>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const key = nearDuplicateKey(item.listing);
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    (n < cap ? first : rest).push(item);
  }
  return [...first, ...rest];
}

export function hasAnyPhoto(l: Pick<MapListing, "thumbnail" | "photos">): boolean {
  return Boolean(l.thumbnail?.trim() || l.photos?.some((u) => u.trim()));
}

// -------------------------------------------------------------- area labels

const LANDMARKS = places.filter((p) => p.zoom >= 15 && !p.districtOnly);

/**
 * "Hongdae" only when the home really is near it: the nearest named place within
 * 700 m wins over a looser address match; else the neighbourhood/district text.
 */
export function areaLabel(l: Pick<MapListing, "lat" | "lng" | "address">): string | null {
  let best: { name: string; d: number } | undefined;
  for (const p of LANDMARKS) {
    const d = distanceM(l, p);
    if (d <= 700 && (!best || d < best.d)) best = { name: p.names[0]!, d };
  }
  const district = englishDistrict(l.address);
  const title = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => `${a}${b.toUpperCase()}`);
  if (best) return `Near ${title(best.name)}`;
  const hood = englishNeighborhood(l.address);
  if (hood && district) return `${hood} · ${district}`;
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
  if (/\b(built|constructed)\b|\bnewly built\b|\bnew building\b|\byears? old\b|\byrs? old\b|\bnewer\b/.test(r) && facts.builtYear == null) return false;
  const builtYear = /\b(?:built|from|in)\s+((?:19|20)\d{2})\b/.exec(r)?.[1];
  if (builtYear && facts.builtYear != null && Number(builtYear) !== facts.builtYear) return false;
  if (/subway|metro|\bwalk/.test(r) && facts.subwayWalkMin == null) return false;
  if (/elevator/.test(r) && !facts.tags.includes("elevator")) return false;
  if (/quiet|calm|peaceful/.test(r) && !facts.tags.includes("quiet")) return false;
  if (/parking/.test(r) && !facts.tags.includes("parking")) return false;
  if (/furnished|full[- ]option/.test(r) && !facts.tags.includes("furnished")) return false;
  if (/\bpet/.test(r) && !facts.tags.includes("pet")) return false;
  if (/\bfloor\b|rooftop|basement/.test(r) && !facts.floor) return false;
  if (/spacious|roomy|large\b/.test(r) && !(facts.m2 != null && facts.m2 >= 33)) return false;
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
}): string {
  const { picks } = input;
  const dealWord =
    input.deals.length === 1 ? { jeonse: "jeonse", wolse: "monthly-rent", sale: "for-sale" }[input.deals[0]!] : "";
  const roomWord = input.rooms ? `${roomsLabel(input.rooms).replace(" (best effort)", "").toLowerCase()} ` : "";
  const what = [dealWord, roomWord.trim(), input.typeWord].filter(Boolean).join(" ");
  const where = input.placeName ? ` near ${input.placeName}` : "";
  const head = `Top ${input.count} ${what}${input.count === 1 ? "" : "s"}${where}, from ${input.candidates} match${input.candidates === 1 ? "" : "es"}`;
  const bits: string[] = [];
  const rents = picks.filter((p) => p.salesType === "wolse" && p.rent != null).map((p) => p.rent!);
  const deposits = picks.filter((p) => p.deposit != null && p.salesType !== "sale").map((p) => p.deposit!);
  const rent = rangeText(rents, formatKrwFromManwon);
  const dep = rangeText(deposits, formatKrwFromManwon);
  if (rent) bits.push(`rent ${rent}/mo`);
  if (dep) bits.push(`${input.deals.includes("jeonse") && !rents.length ? "jeonse" : "deposit"} ${dep}`);
  const areas = picks.map((p) => p.areaM2).filter((v): v is number => typeof v === "number");
  if (areas.length) bits.push(`${Math.round(Math.min(...areas))}–${Math.round(Math.max(...areas))} m²`);
  const tail = bits.length ? `: ${bits.join(", ")}` : "";
  return `${head}${tail}${input.cheap ? " — sorted by rent plus deposit cost" : ""}.`.replace("..", ".");
}

export { formatFloor };
