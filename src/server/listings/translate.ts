import { env } from "~/env";
import { hasHangul } from "~/lib/listings/foreigner";
import { cached } from "./cache";

export type TranslatedNotes = {
  english: string | null;
  source: "original" | "openai" | "none";
};

export async function translateListingNotes(text: string): Promise<TranslatedNotes> {
  const trimmed = text.trim();
  if (!trimmed) return { english: null, source: "none" };
  if (!hasHangul(trimmed)) return { english: trimmed, source: "original" };
  const key = env.OPENAI_API_KEY;
  if (!key) return { english: null, source: "none" };
  const cacheKey = `notes:${trimmed.length}:${hashText(trimmed)}`;
  return cached(cacheKey, 24 * 60 * 60 * 1000, () => translateWithOpenAi(trimmed, key));
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
): Promise<TranslatedNotes> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
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
            content:
              'Translate a Korea rental listing into clear English for a foreign renter. Keep numbers, station names, and Korean legal terms (전입신고, 확정일자, 위반건축물) with a short gloss. Return JSON {"english":"..."}. Do not invent amenities that are not in the source.',
          },
          { role: "user", content: text.slice(0, 3500) },
        ],
      }),
    });
    if (!response.ok) return { english: null, source: "none" };
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { english: null, source: "none" };
    const parsed = JSON.parse(content) as { english?: unknown };
    const english = typeof parsed.english === "string" ? parsed.english.trim() : "";
    if (!english) return { english: null, source: "none" };
    return { english, source: "openai" };
  } catch {
    return { english: null, source: "none" };
  } finally {
    clearTimeout(timer);
  }
}
