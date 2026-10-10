import { env } from "~/env";
import { type AskFallbackReason } from "~/lib/listings/ask-picks";

export function isOpenAiConfigured() {
  return Boolean(env.OPENAI_API_KEY);
}

/**
 * Rate limiting: Ziggybang itself applies none to Ask. The only limit is
 * OpenAI's per-key requests-per-minute / tokens-per-minute for gpt-4o-mini,
 * which answers 429. We retry once after the server's Retry-After (capped),
 * then fall back to on-site logic and tell the client why.
 */
const MAX_RETRY_AFTER_MS = 1_500;

/** 429 means either a per-minute limit (retry later) or an exhausted quota (it will not recover). */
export function classifyOpenAiFailure(status: number, body: string): AskFallbackReason {
  if (status === 429) {
    return /insufficient_quota|exceeded your current quota|billing/i.test(body) ? "quota" : "rate_limited";
  }
  if (status === 401 || status === 403) return "auth";
  return "error";
}

function retryDelayMs(response: Response): number {
  const header = Number(response.headers.get("retry-after"));
  const ms = Number.isFinite(header) && header > 0 ? header * 1000 : 800;
  return Math.min(MAX_RETRY_AFTER_MS, ms);
}

export type OpenAiJson =
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; reason: AskFallbackReason };

/** One JSON-mode chat completion with a hard timeout. Never throws. */
export async function callOpenAiJson(input: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  timeoutMs: number;
  signal?: AbortSignal;
  maxTokens?: number;
}): Promise<OpenAiJson | null> {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  input.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0.2,
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: input.system }, ...input.messages],
  });
  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body,
      });
      if (response.status !== 429 || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response!)));
    }
    if (!response) return { ok: false, reason: "error" };
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const reason = classifyOpenAiFailure(response.status, detail);
      console.warn(`[ask] OpenAI ${response.status} (${reason}): ${detail.slice(0, 300)}`);
      return { ok: false, reason };
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { ok: false, reason: "error" };
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "error" };
    return { ok: true, json: parsed as Record<string, unknown> };
  } catch (error) {
    console.warn(`[ask] OpenAI call failed: ${error instanceof Error ? error.name : "unknown"}`);
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}
