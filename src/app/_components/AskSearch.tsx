"use client";

import { useEffect, useRef, useState } from "react";
import {
  ASK_FALLBACK_NOTICE,
  ASK_SUGGESTIONS,
  interpretSearch,
  type AskFallbackReason,
  type SearchSnapshot,
} from "~/lib/listings/ai-search";
import { api } from "~/trpc/react";

/** After this long we stop waiting on the AI and use on-site search instead. */
const AI_TIMEOUT_MS = 30_000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function AskSearch({
  open,
  current,
  onClose,
  onApply,
}: {
  open: boolean;
  current: SearchSnapshot;
  onClose: () => void;
  onApply: (snapshot: SearchSnapshot) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [provider, setProvider] = useState<"local" | "openai">("local");
  const [elapsed, setElapsed] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const aiStatus = api.listings.aiStatus.useQuery(undefined, {
    staleTime: 60_000,
    enabled: open,
  });
  const utils = api.useUtils();
  const [fallback, setFallback] = useState<AskFallbackReason | null>(null);
  /** Controller of the request in flight; also the synchronous submit lock. */
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, pending]);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [pending]);

  // Closing the dialog (button, backdrop, Escape in MapApp) cancels the request.
  useEffect(() => {
    if (open) return;
    inFlight.current?.abort();
  }, [open]);
  useEffect(() => () => inFlight.current?.abort(), []);

  if (!open) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    // One request at a time: a double click / Enter-then-click, or the same
    // query again while it is still running, is ignored.
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setDraft("");
    const history: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(history);
    setPending(true);
    setFallback(null);
    const finish = (
      result: { snapshot: SearchSnapshot; reply: string; noIntent?: boolean },
      used: "local" | "openai",
      reason: AskFallbackReason | null,
    ) => {
      if (controller.signal.aborted) return;
      // Off-topic / no-intent answers leave the map's filters untouched.
      if (!result.noIntent) onApply(result.snapshot);
      setProvider(used);
      setFallback(reason);
      setMessages([...history, { role: "assistant", content: result.reply }]);
    };
    try {
      if (aiStatus.data?.openai) {
        const timer = setTimeout(() => controller.abort("timeout"), AI_TIMEOUT_MS);
        try {
          const result = await utils.client.listings.ask.mutate(
            { messages: history, current },
            { signal: controller.signal },
          );
          finish(result, result.provider, result.fallbackReason ?? null);
        } finally {
          clearTimeout(timer);
        }
        return;
      }
      finish(interpretSearch(trimmed, current), "local", null);
    } catch {
      if (controller.signal.aborted && controller.signal.reason !== "timeout") {
        // Cancelled by the user: apply nothing.
        return;
      }
      const timedOut = controller.signal.reason === "timeout";
      // Fall back to on-site search; the signal may be aborted by our own
      // timeout, so apply without the aborted guard.
      const result = interpretSearch(trimmed, current);
      if (!result.noIntent) onApply(result.snapshot);
      setProvider("local");
      setFallback(timedOut ? "timeout" : "error");
      setMessages([...history, { role: "assistant", content: result.reply }]);
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setPending(false);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close ask search"
        className="fixed inset-0 z-[1400] bg-slate-950/40 md:hidden"
        onClick={onClose}
      />
      <div className="fixed inset-x-3 bottom-3 z-[1401] flex max-h-[min(28rem,58dvh)] w-auto max-w-none flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl md:inset-auto md:left-3 md:right-auto md:top-3 md:bottom-3 md:w-[calc(var(--desktop-panel)-1.5rem)] md:max-w-[calc(40%-1.5rem)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-300">Ask Ziggybang</p>
            <h2 className="text-sm font-semibold">Tell me what you need</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {aiStatus.data?.openai
                ? "OpenAI sets map filters — area, rent, type, floor, and building age. Amenity words like pet or rooftop can match titles."
                : "Turns your sentence into map filters (area, rent, type, floor, building age). Add OPENAI_API_KEY for a smarter chat."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
          >
            Close
          </button>
        </div>
        <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                Neighborhood, budget, floor, and building age are enough. Extra amenity words
                like pet or rooftop can match listing titles.
              </p>
              {ASK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  disabled={pending}
                  className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-sky-400 text-slate-950"
                    : "bg-white/10 text-slate-100"
                }`}
              >
                {message.content}
              </div>
            ))
          )}
          {pending ? (
            <div role="status" aria-live="polite" className="flex items-start gap-2 text-xs text-slate-300">
              <span className="mt-0.5 flex shrink-0 gap-1" aria-hidden="true">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
              <span>
                {aiStatus.data?.openai
                  ? elapsed < 5
                    ? "Searching filters…"
                    : elapsed < 12
                      ? `Still working (${elapsed}s)… the AI is reading your request.`
                      : `Taking longer than usual (${elapsed}s). Will fall back to on-site search at ${AI_TIMEOUT_MS / 1000}s.`
                  : "Searching filters…"}
              </span>
            </div>
          ) : messages.length ? (
            <p
              className={`text-[10px] ${fallback ? "text-amber-300" : "text-slate-500"}`}
              role={fallback ? "status" : undefined}
            >
              {fallback
                ? ASK_FALLBACK_NOTICE[fallback]
                : provider === "openai"
                  ? "Answered with OpenAI"
                  : "Answered with on-site search"}
            </p>
          ) : null}
        </div>
        <form
          className="border-t border-white/10 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <label className="block">
            <span className="sr-only">Ask for homes</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="e.g. officetel near Dangsan, rent under ₩700,000"
              autoComplete="off"
              className="search-input w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="rounded-full bg-sky-400 px-3 py-1 text-xs font-medium text-slate-950 disabled:opacity-40"
            >
              Search
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
