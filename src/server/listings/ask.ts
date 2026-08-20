import { env } from "~/env";
import {
  describeSearchSnapshot,
  interpretSearch,
  mergeSearchIntent,
  type SearchIntent,
  type SearchSnapshot,
} from "~/lib/listings/ai-search";
import { areaBuckets } from "~/lib/listings/area";
import { type ViewMode } from "~/lib/listings/prefs";
import { propertyTypes, salesTypes } from "~/lib/listings/types";
import { floorFilters, type FloorFilter } from "~/lib/listings/floor";

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
  const timer = setTimeout(() => controller.abort(), 8000);
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
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You help foreigners search Korea rentals on Ziggybang.
Return JSON with: reply (short English), searchInput (neighborhood or station text, null to clear), propertyTypes (oneroom, villa, officetel, apartment), salesTypes (jeonse, wolse, sale), areaBucketIds (xs, s, m, l), radiusM, viewMode (map, list, or best), minDeposit, maxDeposit, minRent, maxRent, foreignerOk (true if they need a landlord who accepts foreigners), floorFilter (no-basement, min-2, or min-5).
Prices are 만원 (10,000 KRW). 1억 = 10000. ₩20 million deposit = 2000. ₩800,000/month = 80.
searchInput should be the neighborhood or station only — do not put leftover English words like digital, complex, or no basement into searchInput.
Use null to clear a field, omit unchanged fields. Prefer viewMode list, or best when they ask for recommendations, nicest homes, or best value.`,
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
  const snapshot = mergeSearchIntent(current, { ...ai.intent, viewMode: ai.intent.viewMode ?? "list" });
  const reply = ai.reply?.trim();
  return {
    snapshot,
    reply: reply ? reply : describeSearchSnapshot(snapshot),
    provider: "openai",
  };
}
