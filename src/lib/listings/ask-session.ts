import { isLang, type Lang } from "~/lib/i18n";
import { type AskConstraints, type AskPicksResult } from "./ask-picks";

export type AskMessage = { role: "user" | "assistant"; content: string };
export type AskStoredResult = Extract<AskPicksResult, { status: "ok" | "empty" }>;

export type AskSession = {
  messages: AskMessage[];
  constraints: AskConstraints | null;
  result: AskStoredResult | null;
  /** UI language the stored result text (summary, reasons) was written in. */
  lang?: Lang;
};

const KEY = "ziggybang:ask:v1";

function storage(): Storage | null {
  try {
    return globalThis.window?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function loadAskSession(): AskSession | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<AskSession> | null;
    if (!data || typeof data !== "object") return null;
    const okShape = (r: unknown): r is AskStoredResult => {
      const x = r as { status?: string; picks?: Array<{ listing?: { id?: string } }> } | null;
      if (x?.status === "empty") return true;
      return x?.status === "ok" && Array.isArray(x.picks) && x.picks.every((p) => Boolean(p?.listing?.id));
    };
    const validResult = okShape(data.result) ? data.result : null;
    if (!validResult) return null;
    return {
      messages: Array.isArray(data.messages) ? data.messages.slice(-10) : [],
      constraints: data.constraints ?? validResult.constraints,
      result: validResult,
      ...(isLang(data.lang) ? { lang: data.lang } : {}),
    };
  } catch {
    return null;
  }
}

export function saveAskSession(session: AskSession | null): void {
  const store = storage();
  if (!store) return;
  try {
    if (!session?.result) store.removeItem(KEY);
    else store.setItem(KEY, JSON.stringify(session));
  } catch {
    /* quota / private mode */
  }
}
