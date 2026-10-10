import {
  OFF_TOPIC_REPLY,
  ROOM_COUNT_NOTE,
  composeAskIntent,
  emptyAskSnapshot,
  hasSearchIntent,
  interpretSearch,
  isFreshAsk,
  mentionsRoomCount,
  mergeSearchIntent,
  type SearchIntent,
  type SearchSnapshot,
} from "~/lib/listings/ai-search";
import {
  PREFERENCE_LABEL,
  SEOUL_CENTER,
  constraintsToSnapshot,
  detectPreferences,
  preferenceKey,
  snapshotToConstraints,
  type AskConstraints,
  type AskFallbackReason,
  type AskInterpretResult,
  type AskPlace,
} from "~/lib/listings/ask-picks";
import { areaBuckets } from "~/lib/listings/area";
import { ageFilters } from "~/lib/listings/age";
import { floorFilters } from "~/lib/listings/floor";
import { normalizeBuildingAgeFilter } from "~/lib/listings/building-age";
import { matchPlace, normalizeSearch } from "~/lib/listings/search";
import { propertyTypes, salesTypes } from "~/lib/listings/types";
import { type Place } from "~/lib/geo/places";
import { distanceM } from "~/lib/geo/shape";
import { detectRoomCount } from "~/lib/listings/ask-quality";
import { geocodeKorea } from "./geocode";
import { withTimeout } from "./http";
import { callOpenAiJson, classifyOpenAiFailure, isOpenAiConfigured } from "./openai";

export { classifyOpenAiFailure, isOpenAiConfigured };

type Message = { role: "user" | "assistant"; content: string };

const INTERPRET_TIMEOUT_MS = 8_000;
const GEOCODE_TIMEOUT_MS = 3_500;

function pickKnown<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return values.filter(
    (value): value is T => typeof value === "string" && (allowed as readonly string[]).includes(value),
  );
}

function asNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

/** Whatever the model returned, narrowed to values we understand. Grounding happens later. */
export function intentFromUnknown(raw: unknown): SearchIntent {
  if (!raw || typeof raw !== "object") return {};
  const data = raw as Record<string, unknown>;
  const property = pickKnown(data.propertyTypes, propertyTypes);
  const sales = pickKnown(data.salesTypes, salesTypes);
  const areas = pickKnown(
    data.areaBucketIds,
    areaBuckets.map((bucket) => bucket.id),
  );
  const built = normalizeBuildingAgeFilter({ maxBuildingAge: data.maxBuildingAge });
  const flag = (value: unknown) =>
    value === null ? null : typeof value === "boolean" ? value : undefined;
  return {
    searchInput:
      data.searchInput === null ? null : typeof data.searchInput === "string" ? data.searchInput : undefined,
    propertyTypes: data.propertyTypes === null ? null : property.length ? property : undefined,
    salesTypes: data.salesTypes === null ? null : sales.length ? sales : undefined,
    areaBucketIds: data.areaBucketIds === null ? null : areas.length ? areas : undefined,
    radiusM: asNumber(data.radiusM),
    minDeposit: asNumber(data.minDeposit),
    maxDeposit: asNumber(data.maxDeposit),
    minRent: asNumber(data.minRent),
    maxRent: asNumber(data.maxRent),
    foreignerOk: flag(data.foreignerOk),
    hasPhotos: flag(data.hasPhotos),
    floorFilter:
      data.floorFilter === null
        ? null
        : typeof data.floorFilter === "string" && (floorFilters as readonly string[]).includes(data.floorFilter)
          ? (data.floorFilter as (typeof floorFilters)[number])
          : undefined,
    ageFilter:
      data.ageFilter === null
        ? null
        : typeof data.ageFilter === "string" && (ageFilters as readonly string[]).includes(data.ageFilter)
          ? (data.ageFilter as (typeof ageFilters)[number])
          : undefined,
    maxBuildingAge: data.maxBuildingAge === null ? null : built.maxBuildingAge,
  };
}

const SYSTEM_PROMPT = `You extract rental-search constraints from a message for Ziggybang (Korean rentals). Apply ONLY constraints the user actually stated. Every field you are not sure about must be omitted — never guess, never add a "sensible default".
Return JSON with:
- offTopic: true if the message is not about finding a rental, or has no searchable constraint at all ("what is the weather", "something nice"). Then omit everything else.
- searchInput: neighborhood or station name ONLY (e.g. "Guro Digital", "Hongdae", "Seoul Station"). No numbers, prices, sentences, "years old", "near", "good value".
- preferences: soft wishes that should influence ranking but never exclude homes, each 1-3 plain English words, only ones the user explicitly asked for (e.g. "quiet", "close to subway", "elevator", "pet-friendly", "sunny", "furnished", "parking"). Max 4.
- propertyTypes: oneroom, villa, officetel, apartment — only if they named a type ("studio" = oneroom)
- salesTypes: jeonse, wolse, sale — only if they said jeonse/monthly/rent/buy (a monthly rent amount implies wolse)
- areaBucketIds: xs, s, m, l — ONLY if they talked about size (m², pyeong, tiny, spacious). A price like "under 200 million" is NOT a size.
- radiusM: meters, only if they gave a distance or said walking distance
- minDeposit, maxDeposit, minRent, maxRent in 만원 (10,000 KRW units): ₩20 million = 2000; ₩800,000 = 80; 600k = ₩600,000 = 60; 50만원 = 50; 5백만원 = 500; 5천만원 = 5000; 1억 = 10000; 1 million = 100. "700k monthly" is maxRent 70.
- foreignerOk: true only if they need a landlord who accepts foreigners
- hasPhotos: true only if they want listings with photos
- floorFilter: no-basement, min-2, or min-5 — only if they mentioned floors/basement
- ageFilter: week or month — ONLY for "listed this week / this month / new listings / recently posted". "newest buildings", "new construction", "under 5 years old" are building age, NOT ageFilter.
- maxBuildingAge: integer 5–39 from "less than 15 years old", "newer than 10 yrs", "under 10 years".
Room counts are handled elsewhere; ignore "2 bedroom", "투룸" (do not turn them into a size or type).
Follow-up (cheaper, no basement, bigger, only with elevator, newer): "Current constraints" are already applied and are kept automatically. Return ONLY what the new message changes or adds; do not repeat searchInput unless they name a different area. Use null only when they ask to clear a filter.`;

type InterpretAi =
  | { ok: true; intent: SearchIntent; offTopic: boolean; preferences: string[] }
  | { ok: false; reason: AskFallbackReason };

async function interpretWithOpenAi(
  messages: Message[],
  current: SearchSnapshot,
  signal?: AbortSignal,
): Promise<InterpretAi | null> {
  const result = await callOpenAiJson({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Current constraints: ${JSON.stringify(current)}` }, ...messages],
    timeoutMs: INTERPRET_TIMEOUT_MS,
    signal,
  });
  if (!result) return null;
  if (!result.ok) return result;
  const prefs = Array.isArray(result.json.preferences)
    ? result.json.preferences.filter((p): p is string => typeof p === "string")
    : [];
  return {
    ok: true,
    intent: intentFromUnknown(result.json),
    offTopic: result.json.offTopic === true,
    preferences: prefs,
  };
}

/**
 * Soft wishes: our keyword table is authoritative; a model phrase only
 * survives when we recognise it or its words really appear in the request.
 */
export function groundPreferences(aiPrefs: string[], text: string, local: string[]): string[] {
  const out: string[] = [];
  const add = (label: string) => {
    if (!out.includes(label)) out.push(label);
  };
  for (const key of local) add(PREFERENCE_LABEL[key] ?? key);
  const hay = normalizeSearch(text);
  for (const raw of aiPrefs) {
    const phrase = raw.trim().toLowerCase().slice(0, 40);
    if (!phrase) continue;
    const key = preferenceKey(phrase);
    if (key) {
      if (local.includes(key)) continue;
      // A recognised wish is only kept if the request mentions it somehow.
      if (detectPreferences(text).includes(key)) add(PREFERENCE_LABEL[key] ?? key);
      continue;
    }
    const words = normalizeSearch(phrase).split(" ").filter((w) => w.length >= 4);
    if (words.length && words.every((w) => hay.includes(w))) add(phrase);
  }
  return out.slice(0, 4);
}

function radiusForZoom(place: Place): number {
  if (place.radiusM) return place.radiusM;
  if (place.zoom <= 13) return 3000;
  if (place.zoom === 14) return 2000;
  return 1000;
}

type PlaceResolver = (text: string) => Promise<Place | null>;

async function defaultResolvePlace(text: string): Promise<Place | null> {
  const catalog = matchPlace(text);
  if (catalog) return catalog;
  try {
    return await withTimeout(geocodeKorea(text), GEOCODE_TIMEOUT_MS, "Geocoder");
  } catch {
    return null;
  }
}

export type InterpretDeps = { resolvePlace?: PlaceResolver; forceAi?: boolean };

/** Resolve the area text into coordinates; falls back to the map view / central Seoul. */
export async function resolveAskPlace(
  searchInput: string,
  radiusOverride: number | undefined,
  previous: AskPlace | undefined,
  viewport: { lat: number; lng: number } | undefined,
  assumptions: string[],
  resolver: PlaceResolver = defaultResolvePlace,
): Promise<AskPlace> {
  const text = searchInput.trim();
  if (text) {
    if (previous?.kind === "place" && normalizeSearch(previous.name) === normalizeSearch(text)) {
      return { ...previous, radiusM: radiusOverride ?? previous.radiusM };
    }
    const found = await resolver(text);
    if (found) {
      const name = found.id.startsWith("geo:") ? text : (found.names[0] ?? text);
      return {
        name,
        lat: found.lat,
        lng: found.lng,
        radiusM: Math.min(3000, Math.max(250, radiusOverride ?? radiusForZoom(found))),
        kind: "place",
      };
    }
    assumptions.push(`I couldn't locate “${text.slice(0, 40)}”, so I searched around the current map view instead.`);
  } else if (previous?.kind === "viewport" && !viewport) {
    return previous;
  } else if (!viewport) {
    assumptions.push("No area was given, so I searched around central Seoul.");
  } else {
    assumptions.push("No area was given, so I searched around the current map view.");
  }
  const center = viewport ?? SEOUL_CENTER;
  return { name: "current map view", ...center, radiusM: Math.min(3000, Math.max(250, radiusOverride ?? 1500)), kind: "viewport" };
}

const EXPLICIT_DISTANCE = /\d\s*(?:km|m\b|meters?|metres?|미터|킬로)|walking distance|walkable|도보|반경/i;

const CONSTRAINT_FIELDS = [
  "searchInput",
  "propertyTypes",
  "salesTypes",
  "areaBucketIds",
  "minDeposit",
  "maxDeposit",
  "minRent",
  "maxRent",
  "foreignerOk",
  "hasPhotos",
  "floorFilter",
  "ageFilter",
  "maxBuildingAge",
  "radiusM",
] as const;

function hasConstraintIntent(intent: SearchIntent): boolean {
  // viewMode and amenity title-words are not constraints for picks.
  const { viewMode: _view, listingQuery: _query, ...rest } = intent;
  void _view;
  void _query;
  return hasSearchIntent(rest) || CONSTRAINT_FIELDS.some((key) => rest[key] !== undefined);
}

const NEW_SEARCH_WORDS = /\b(find|search|show me|looking for|i want|new search|instead|different area)\b|찾아|다시 검색/i;
const UNRESOLVED_PLACE_HINT =
  /[가-힣]{2,}(?:동|구|역|읍|면|로|길)(?![가-힣])|\b(?:near|in|around|close to|next to|by)\s+[A-Za-z가-힣]/i;

/**
 * The deterministic parser already understood the message well enough that the
 * extra LLM round trip (~2 s) buys nothing: a catalog place or a follow-up that
 * only changes known fields. Unknown place names still go to the model.
 */
export function localInterpretIsEnough(
  text: string,
  intent: SearchIntent,
  prefs: string[],
  rooms: number | undefined,
  hasPrevious: boolean,
): boolean {
  const changed = hasConstraintIntent(intent) || prefs.length > 0 || rooms !== undefined;
  if (!changed) return false;
  if (intent.searchInput) return Boolean(matchPlace(intent.searchInput));
  if (hasPrevious) return true;
  // New search without a recognised place: only fine if the text names none.
  return !UNRESOLVED_PLACE_HINT.test(text);
}

/**
 * Natural language (plus the previous constraints, for follow-ups) → grounded,
 * structured constraints with the place resolved to coordinates.
 * A follow-up (`previous` set) MERGES into the previous constraints: it only
 * adds or overrides what the message changes. Only an explicit new search
 * naming a different area starts from scratch.
 */
export async function interpretAsk(
  input: { messages: Message[]; previous?: AskConstraints; viewport?: { lat: number; lng: number }; signal?: AbortSignal },
  deps: InterpretDeps = {},
): Promise<AskInterpretResult> {
  const { messages, previous, viewport } = input;
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const current = constraintsToSnapshot(previous ?? {});
  const local = interpretSearch(lastUser, current);
  const localPrefs = detectPreferences(lastUser);
  const rooms = detectRoomCount(lastUser);
  const configured = isOpenAiConfigured();
  const enough = localInterpretIsEnough(lastUser, local.intent, localPrefs, rooms, Boolean(previous));
  const useAi = configured && (deps.forceAi === true || !enough);
  // Resolve the place the parser found while the model is thinking; reused when they agree.
  const resolver = deps.resolvePlace;
  const localPlaceGuess = local.intent.searchInput?.trim();
  const speculativePlace =
    useAi && localPlaceGuess
      ? resolveAskPlace(localPlaceGuess, undefined, previous?.place, viewport, [], resolver)
      : null;
  const ai = useAi ? await interpretWithOpenAi(messages, current, input.signal) : null;
  const fallbackReason: AskFallbackReason | undefined = !configured
    ? "unconfigured"
    : !useAi
      ? undefined
      : ai && !ai.ok
        ? ai.reason
        : ai
          ? undefined
          : "error";
  const aiOk = ai?.ok ? ai : undefined;

  const intent: SearchIntent = aiOk
    ? composeAskIntent(
        aiOk.offTopic ? {} : aiOk.intent,
        local.intent,
        false,
        lastUser,
      )
    : local.intent;
  // "cheaper" / "a bit more": the parser's relative-price answer survives when the model gave no number.
  for (const key of ["minDeposit", "maxDeposit", "minRent", "maxRent"] as const) {
    if (intent[key] === undefined && local.intent[key] !== undefined) intent[key] = local.intent[key];
  }
  const preferences = groundPreferences(aiOk && !aiOk.offTopic ? aiOk.preferences : [], lastUser, localPrefs);

  const stated = hasConstraintIntent(intent) || preferences.length > 0 || rooms !== undefined;
  if (!stated) {
    // A follow-up the model judged on-topic ("make it brighter") just informs ranking.
    if (previous && aiOk && !aiOk.offTopic) {
      return {
        status: "ok",
        constraints: previous,
        assumptions: ["Kept your earlier constraints and used your note when ranking."],
        provider: "openai",
      };
    }
    return { status: "off_topic", reply: OFF_TOPIC_REPLY };
  }

  // Follow-ups merge; a brand-new search (no previous, or an explicit "find …" in another area) resets.
  const prevName = previous?.place?.kind === "place" ? previous.place.name : undefined;
  const namesOtherArea =
    Boolean(intent.searchInput) && (!prevName || normalizeSearch(intent.searchInput!) !== normalizeSearch(prevName));
  const fresh = !previous || (namesOtherArea && NEW_SEARCH_WORDS.test(lastUser));
  const base = fresh ? emptyAskSnapshot({ radiusM: current.radiusM }) : current;
  const snapshot = mergeSearchIntent(base, { ...intent, viewMode: undefined, listingQuery: undefined });
  const assumptions: string[] = [];
  // A catalog station's default walk radius is not something the user said.
  const statedRadius =
    typeof intent.radiusM === "number" && EXPLICIT_DISTANCE.test(lastUser) ? snapshot.radiusM : undefined;
  const keepPrevPlace = fresh && !snapshot.searchInput ? undefined : previous?.place;
  let place: AskPlace;
  if (
    speculativePlace &&
    localPlaceGuess &&
    normalizeSearch(localPlaceGuess) === normalizeSearch(snapshot.searchInput) &&
    statedRadius === undefined
  ) {
    place = await speculativePlace;
  } else {
    place = await resolveAskPlace(snapshot.searchInput, statedRadius, keepPrevPlace, viewport, assumptions, resolver);
  }
  // Same spot as before under another spelling ("망원동" vs "Mangwon"): keep the earlier place and radius.
  if (
    previous?.place?.kind === "place" &&
    place.kind === "place" &&
    place.name !== previous.place.name &&
    distanceM(place, previous.place) < 400
  ) {
    place = { ...previous.place, radiusM: statedRadius ?? previous.place.radiusM };
  }
  const carried = fresh ? [] : (previous?.preferences ?? []);
  // A stated cap or size bucket already says it; don't also show "newer building" / "spacious".
  const redundant = new Set<string>();
  if (snapshot.maxBuildingAge) redundant.add(PREFERENCE_LABEL.newer!);
  if (snapshot.areaBucketIds.length) redundant.add(PREFERENCE_LABEL.spacious!);
  const merged = [...new Set([...carried, ...preferences])].filter((p) => !redundant.has(p)).slice(0, 5);
  const constraints = snapshotToConstraints(snapshot, place, merged);
  const nextRooms = rooms ?? (fresh ? undefined : previous?.rooms);
  if (nextRooms) constraints.rooms = nextRooms;
  return {
    status: "ok",
    constraints,
    assumptions,
    provider: aiOk ? "openai" : "local",
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
