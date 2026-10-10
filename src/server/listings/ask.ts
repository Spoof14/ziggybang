import { env } from "~/env";
import {
  type AskFallbackReason,
  OFF_TOPIC_REPLY,
  ROOM_COUNT_NOTE,
  composeAskIntent,
  describeSearchSnapshot,
  emptyAskSnapshot,
  hasSearchIntent,
  interpretSearch,
  isFreshAsk,
  mentionsRoomCount,
  mergeSearchIntent,
  type SearchIntent,
  type SearchSnapshot,
} from "~/lib/listings/ai-search";
import { areaBuckets } from "~/lib/listings/area";
import { type ViewMode } from "~/lib/listings/prefs";
import { propertyTypes, salesTypes } from "~/lib/listings/types";
import { ageFilters, type AgeFilter } from "~/lib/listings/age";
import { floorFilters, type FloorFilter } from "~/lib/listings/floor";
import { normalizeBuildingAgeFilter } from "~/lib/listings/building-age";

const VIEW_MODES: ViewMode[] = ["map", "list", "saved", "best"];

function pickKnown<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value),
  );
}

function asNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function intentFromUnknown(raw: unknown): SearchIntent {
  if (!raw || typeof raw !== "object") return {};
  const data = raw as Record<string, unknown>;
  const property = pickKnown(data.propertyTypes, propertyTypes);
  const sales = pickKnown(data.salesTypes, salesTypes);
  const areas = pickKnown(
    data.areaBucketIds,
    areaBuckets.map((bucket) => bucket.id),
  );
  const viewMode =
    typeof data.viewMode === "string" && VIEW_MODES.includes(data.viewMode as ViewMode)
      ? (data.viewMode as ViewMode)
      : undefined;
  const built = normalizeBuildingAgeFilter({ maxBuildingAge: data.maxBuildingAge });
  return {
    searchInput:
      data.searchInput === null
        ? null
        : typeof data.searchInput === "string"
          ? data.searchInput
          : undefined,
    propertyTypes: data.propertyTypes === null ? null : property.length ? property : undefined,
    salesTypes: data.salesTypes === null ? null : sales.length ? sales : undefined,
    areaBucketIds: data.areaBucketIds === null ? null : areas.length ? areas : undefined,
    radiusM: asNumber(data.radiusM),
    viewMode,
    minDeposit: asNumber(data.minDeposit),
    maxDeposit: asNumber(data.maxDeposit),
    minRent: asNumber(data.minRent),
    maxRent: asNumber(data.maxRent),
    foreignerOk:
      data.foreignerOk === null ? null : typeof data.foreignerOk === "boolean" ? data.foreignerOk : undefined,
    hasPhotos:
      data.hasPhotos === null ? null : typeof data.hasPhotos === "boolean" ? data.hasPhotos : undefined,
    floorFilter:
      data.floorFilter === null
        ? null
        : typeof data.floorFilter === "string" &&
            (floorFilters as readonly string[]).includes(data.floorFilter)
          ? (data.floorFilter as FloorFilter)
          : undefined,
    ageFilter:
      data.ageFilter === null
        ? null
        : typeof data.ageFilter === "string" &&
            (ageFilters as readonly string[]).includes(data.ageFilter)
          ? (data.ageFilter as AgeFilter)
          : undefined,
    listingQuery:
      data.listingQuery === null
        ? null
        : typeof data.listingQuery === "string"
          ? data.listingQuery.trim().slice(0, 80) || undefined
          : undefined,
    maxBuildingAge:
      data.maxBuildingAge === null ? null : built.maxBuildingAge,
  };
}

export function isOpenAiConfigured() {
  return Boolean(env.OPENAI_API_KEY);
}

/**
 * Rate limiting: Ziggybang itself applies none to Ask. The only limit is
 * OpenAI's per-key requests-per-minute / tokens-per-minute for gpt-4o-mini
 * (low usage tiers allow only a few requests per minute), which answers 429.
 * We retry once after the server's Retry-After (capped at 2s), then fall back
 * to on-site search and tell the client why.
 */
const OPENAI_TIMEOUT_MS = 12_000;
const MAX_RETRY_AFTER_MS = 2_000;

type OpenAiResult =
  | { ok: true; intent: SearchIntent; offTopic: boolean }
  | { ok: false; reason: AskFallbackReason };

function retryDelayMs(response: Response): number {
  const header = Number(response.headers.get("retry-after"));
  const ms = Number.isFinite(header) && header > 0 ? header * 1000 : 800;
  return Math.min(MAX_RETRY_AFTER_MS, ms);
}

const SYSTEM_PROMPT = `You convert a rental search into Ziggybang map filters. Apply ONLY constraints the user actually stated. Every field you are not sure about must be omitted — never guess, never add a "sensible default".
Return JSON with:
- offTopic: true if the message is not about finding a rental, or has no searchable constraint at all ("what is the weather", "something nice"). Then omit everything else.
- searchInput: neighborhood or station name ONLY (e.g. "Guro Digital", "Hongdae", "Seoul Station"). No numbers, prices, sentences, "years old", "near", "good value".
- listingQuery: amenity words that match listing titles (pet, rooftop, furnished, parking, duplex). Omit if none.
- propertyTypes: oneroom, villa, officetel, apartment — only if they named a type
- salesTypes: jeonse, wolse, sale — only if they said jeonse/monthly/rent/buy (a rent amount implies wolse)
- areaBucketIds: xs, s, m, l — ONLY if they talked about size (m², pyeong, tiny, spacious). A price like "under 200 million" is NOT a size.
- radiusM: meters, only if they gave a distance or said walking distance
- viewMode: map, list, or best — ONLY if they said map / list / recommend / best value / good value. Otherwise omit.
- minDeposit, maxDeposit, minRent, maxRent in 만원 (10,000 KRW units): ₩20 million = 2000; ₩800,000 = 80; 600k = ₩600,000 = 60; 50만원 = 50; 5백만원 = 500; 5천만원 = 5000; 1억 = 10000; 1 million = 100
- foreignerOk: true only if they need a landlord who accepts foreigners
- hasPhotos: true only if they want listings with photos
- floorFilter: no-basement, min-2, or min-5 — only if they mentioned floors/basement
- ageFilter: week or month — ONLY for "listed this week / this month / new listings / recently posted". "newest buildings", "new construction", "under 5 years old" are building age, NOT ageFilter.
- maxBuildingAge: integer 5–39 from "less than 15 years old", "newer than 10 yrs", "under 10 years". 
There is no bedroom/room-count filter: ignore "2 bedroom", "투룸".
Follow-up (cheaper, no basement, bigger): include only the changed fields. Use null only when they ask to clear a filter.`;

async function interpretWithOpenAi(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  current: SearchSnapshot,
): Promise<OpenAiResult | null> {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Current filters: ${JSON.stringify(current)}` },
      ...messages,
    ],
  });
  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body,
      });
      if (response.status !== 429 || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response!)));
    }
    if (!response) return { ok: false, reason: "error" };
    if (response.status === 429) {
      console.warn("[ask] OpenAI rate limited (429); using on-site search");
      return { ok: false, reason: "rate_limited" };
    }
    if (!response.ok) {
      console.warn(`[ask] OpenAI returned ${response.status}; using on-site search`);
      return { ok: false, reason: "error" };
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { ok: false, reason: "error" };
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      ok: true,
      intent: intentFromUnknown(parsed),
      offTopic: parsed.offTopic === true,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

export type AskResult = {
  snapshot: SearchSnapshot;
  reply: string;
  provider: "local" | "openai";
  /** Nothing searchable in the message; snapshot is the unchanged current one. */
  noIntent?: boolean;
  /** Why on-site search answered instead of OpenAI (only when OpenAI is configured). */
  fallbackReason?: AskFallbackReason;
};

export async function askListings(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  current: SearchSnapshot,
): Promise<AskResult> {
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const local = interpretSearch(lastUser, current);
  if (!isOpenAiConfigured()) {
    return {
      snapshot: local.snapshot,
      reply: local.reply,
      provider: "local",
      noIntent: local.noIntent,
    };
  }
  const ai = await interpretWithOpenAi(messages, current);
  if (!ai?.ok) {
    return {
      snapshot: local.snapshot,
      reply: local.reply,
      provider: "local",
      noIntent: local.noIntent,
      fallbackReason: ai ? ai.reason : "error",
    };
  }
  const aiIntent = ai.offTopic ? {} : ai.intent;
  const composed = composeAskIntent(
    aiIntent,
    local.intent,
    isFreshAsk(lastUser, {
      ...aiIntent,
      searchInput: aiIntent.searchInput ?? local.intent.searchInput,
    }),
    lastUser,
  );
  const roomCount = mentionsRoomCount(lastUser);
  if (!hasSearchIntent(composed)) {
    return {
      snapshot: current,
      reply: roomCount ? `${ROOM_COUNT_NOTE} ${OFF_TOPIC_REPLY}` : OFF_TOPIC_REPLY,
      provider: "openai",
      noIntent: true,
    };
  }
  const fresh = isFreshAsk(lastUser, composed);
  const snapshot = mergeSearchIntent(
    fresh ? emptyAskSnapshot(current) : current,
    composed,
  );
  // Describe what was actually applied; the model's own prose can mention
  // filters that grounding removed.
  const reply = [describeSearchSnapshot(snapshot), roomCount ? ROOM_COUNT_NOTE : null]
    .filter(Boolean)
    .join(" ");
  return { snapshot, reply, provider: "openai" };
}
