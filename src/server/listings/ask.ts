import { env } from "~/env";
import {
  composeAskIntent,
  describeSearchSnapshot,
  emptyAskSnapshot,
  interpretSearch,
  isFreshAsk,
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

async function interpretWithOpenAi(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  current: SearchSnapshot,
): Promise<{ intent: SearchIntent; reply?: string } | null> {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You convert a rental search into Ziggybang map filters. You own the filter decision — do not copy leftover English into the search box.
Return JSON with:
- reply: short English confirming the filters
- searchInput: neighborhood or station ONLY (e.g. "Guro Digital", "Hongdae"). null to clear. Never put sentences, "good value", "years old", or "complex" here.
- listingQuery: amenity words that match listing titles (pet, rooftop, furnished, parking, duplex). Empty/null if none. NEVER put "good value", "places", "less than years old", or building age here.
- propertyTypes: oneroom, villa, officetel, apartment
- salesTypes: jeonse, wolse, sale
- areaBucketIds: xs, s, m, l — only if they asked for a size. Do not guess.
- radiusM: meters
- viewMode: map, list, or best. Use best for good value / recommend / nicest.
- minDeposit, maxDeposit, minRent, maxRent in 만원 (₩20 million = 2000, ₩800,000/month = 80, 1억 = 10000)
- foreignerOk: true if they need a landlord who accepts foreigners
- floorFilter: no-basement, min-2, or min-5
- ageFilter: week or month (listing recency, NOT building age)
- maxBuildingAge: integer 5–39. "less than 15 years old" / "under 10 years" → 15 or 10. null to clear.

Fresh search (they name a place or say find/search/looking for): set omitted filters to null so old budget/size/floor/title filters do not carry over. Keep only what they asked for.
Follow-up (cheaper, no basement, bigger): omit unchanged fields.
Do not invent a budget or size if they did not mention one.`,
          },
          {
            role: "user",
            content: `Current filters: ${JSON.stringify(current)}`,
          },
          ...messages,
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { reply?: unknown } & Record<string, unknown>;
    return {
      intent: intentFromUnknown(parsed),
      reply: typeof parsed.reply === "string" ? parsed.reply : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function askListings(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  current: SearchSnapshot,
): Promise<{ snapshot: SearchSnapshot; reply: string; provider: "local" | "openai" }> {
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const local = interpretSearch(lastUser, current);
  if (!isOpenAiConfigured()) {
    return { snapshot: local.snapshot, reply: local.reply, provider: "local" };
  }
  const ai = await interpretWithOpenAi(messages, current);
  if (!ai) {
    return { snapshot: local.snapshot, reply: local.reply, provider: "local" };
  }
  const composed = composeAskIntent(ai.intent, local.intent, isFreshAsk(lastUser, {
    ...ai.intent,
    searchInput: ai.intent.searchInput ?? local.intent.searchInput,
  }));
  const fresh = isFreshAsk(lastUser, composed);
  const snapshot = mergeSearchIntent(
    fresh ? emptyAskSnapshot(current) : current,
    composed,
  );
  const reply = ai.reply?.trim();
  return {
    snapshot,
    reply: reply ? reply : describeSearchSnapshot(snapshot),
    provider: "openai",
  };
}
