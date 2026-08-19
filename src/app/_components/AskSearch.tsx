"use client";

import { useEffect, useRef, useState } from "react";
import {
  ASK_SUGGESTIONS,
  interpretSearch,
  type SearchSnapshot,
} from "~/lib/listings/ai-search";
import { api } from "~/trpc/react";

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
  const scroller = useRef<HTMLDivElement>(null);
  const aiStatus = api.listings.aiStatus.useQuery(undefined, {
    staleTime: 60_000,
    enabled: open,
  });
  const ask = api.listings.ask.useMutation();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, pending]);

  if (!open) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setDraft("");
    const history: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(history);
    setPending(true);
    try {
      if (aiStatus.data?.openai) {
        const result = await ask.mutateAsync({ messages: history, current });
        onApply(result.snapshot);
        setProvider(result.provider);
        setMessages([...history, { role: "assistant", content: result.reply }]);
        return;
      }
      const result = interpretSearch(trimmed, current);
      onApply(result.snapshot);
      setProvider("local");
      setMessages([...history, { role: "assistant", content: result.reply }]);
    } catch {
      const result = interpretSearch(trimmed, current);
      onApply(result.snapshot);
      setProvider("local");
      setMessages([...history, { role: "assistant", content: result.reply }]);
    } finally {
      setPending(false);
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
      <div className="fixed inset-x-3 bottom-3 z-[1401] flex max-h-[min(28rem,58dvh)] w-auto max-w-none flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl md:inset-auto md:right-4 md:top-24 md:bottom-4 md:w-[22.5rem]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-300">Ask Ziggybang</p>
            <h2 className="text-sm font-semibold">Tell me what you need</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {aiStatus.data?.openai
                ? "OpenAI turns your chat into map filters."
                : "Plain-English search. Add OPENAI_API_KEY for a smarter chat."}
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
                Neighborhood, jeonse vs monthly, and a deposit / rent cap is enough.
              </p>
              {ASK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10"
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
            <p className="text-xs text-slate-400">Searching filters…</p>
          ) : messages.length ? (
            <p className="text-[10px] text-slate-500">
              {provider === "openai" ? "Answered with OpenAI" : "Answered with on-site search"}
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
