import { env } from "~/env";
import { hasHangul } from "~/lib/listings/foreigner";

/** Friendly upper bound: past this the client shows a retry message instead of waiting. */
export const TRANSLATE_TIMEOUT_MS = 15_000;
const MAX_SOURCE_CHARS = 2_500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type TranslatedNotes = {
  english: string | null;
  source: "original" | "openai" | "none";
  /** Why there is no translation (only set when `source` is "none" after a model attempt). */
  reason?: "timeout" | "error";
};

/** Only successful translations are cached; failures and timeouts retry on the next click. */
const translations = new Map<string, { value: TranslatedNotes; expiresAt: number }>();
const inflight = new Map<string, Promise<TranslatedNotes>>();

export function clearTranslationCache() {
  translations.clear();
  inflight.clear();
}

const NOTES_PROMPT =
  "Translate this Korean rental listing to concise English. Keep numbers and station names; add a short gloss for legal terms. Add nothing not in the source. Output only the translation.";
const TITLE_PROMPT =
  "Translate this short Korean rental listing headline to natural, concise English (a short phrase). Keep neighbourhood and station names as romanised names. Add nothing not in the source. Output only the translation.";
const BUNDLE_PROMPT = `${NOTES_PROMPT} The input has a headline, a line containing only ===, then the description. Output the English headline, a line containing only ===, then the English description.`;
const BUNDLE_SEPARATOR = "\n===\n";

export type TranslatedBundle = TranslatedNotes & { englishTitle: string | null };

/** Short free-text headline ("서교동 투룸, 넓고 채광도 좋아요"): small, cheap, cached; original when there is nothing to translate. */
export async function translateListingTitle(text: string): Promise<TranslatedNotes> {
  const trimmed = text.trim().slice(0, 160);
  if (!trimmed) return { english: null, source: "none" };
  if (!hasHangul(trimmed)) return { english: trimmed, source: "original" };
  return cachedTranslation(`title:${hashText(trimmed)}`, trimmed, TITLE_PROMPT, 120);
}

/** Headline and description translated together so they read consistently. */
export async function translateListingBundle(title: string, description: string): Promise<TranslatedBundle> {
  const head = title.trim().slice(0, 160);
  const body = description.trim();
  if (!head) return { ...(await translateListingNotes(body)), englishTitle: null };
  if (!body) {
    const only = await translateListingTitle(head);
    return { english: null, source: "none", englishTitle: only.english };
  }
  if (!hasHangul(head) && !hasHangul(body)) return { english: body, source: "original", englishTitle: head };
  const joined = `${head}${BUNDLE_SEPARATOR}${body}`;
  const result = await cachedTranslation(`bundle:${joined.length}:${hashText(joined)}`, joined, BUNDLE_PROMPT, undefined);
  if (result.source !== "openai" || !result.english) return { ...result, englishTitle: null };
  const at = result.english.indexOf("\n===");
  if (at < 0) return { ...(await translateListingNotes(body)), englishTitle: null };
  const englishTitle = result.english.slice(0, at).trim();
  const english = result.english.slice(at).replace(/^\s*===\s*/, "").trim();
  return { english: english || null, source: english ? "openai" : "none", englishTitle: englishTitle || null };
}

export async function translateListingNotes(text: string): Promise<TranslatedNotes> {
  const trimmed = text.trim();
  if (!trimmed) return { english: null, source: "none" };
  if (!hasHangul(trimmed)) return { english: trimmed, source: "original" };
  return cachedTranslation(`notes:${trimmed.length}:${hashText(trimmed)}`, trimmed, NOTES_PROMPT, undefined);
}

async function cachedTranslation(
  cacheKey: string,
  trimmed: string,
  system: string,
  maxTokens: number | undefined,
): Promise<TranslatedNotes> {
  const key = env.OPENAI_API_KEY;
  if (!key) return { english: null, source: "none" };
  const hit = translations.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const pending = inflight.get(cacheKey);
  if (pending) return pending;
  const request = translateWithOpenAi(trimmed, key, system, maxTokens)
    .then((value) => {
      if (value.source === "openai") translations.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    })
    .finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, request);
  return request;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function translateWithOpenAi(
  text: string,
  key: string,
  system: string,
  maxTokens?: number,
): Promise<TranslatedNotes> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const source = text.slice(0, MAX_SOURCE_CHARS);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      // Plain text (no JSON wrapper), short prompt and a token cap keep this fast.
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: maxTokens ?? Math.min(1000, Math.ceil(source.length * 0.9) + 160),
        messages: [
          {
            role: "system",
            content: system,
          },
          { role: "user", content: source },
        ],
      }),
    });
    if (!response.ok) return { english: null, source: "none", reason: "error" };
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const english = payload.choices?.[0]?.message?.content?.trim();
    if (!english) return { english: null, source: "none", reason: "error" };
    return { english, source: "openai" };
  } catch (error) {
    const timedOut = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
    return { english: null, source: "none", reason: timedOut ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}
