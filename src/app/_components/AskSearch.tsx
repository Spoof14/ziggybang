"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type SearchSnapshot } from "~/lib/listings/ai-search";
import {
  ASK_SUGGESTIONS,
  applySuggestion,
  askFallbackNotice,
  constraintChips,
  constraintsToSnapshot,
  displayPlace,
  removeConstraint,
  type AskConstraints,
  type AskFallbackReason,
  type AskPick,
  type AskSuggestion,
} from "~/lib/listings/ask-picks";
import {
  loadAskSession,
  saveAskSession,
  type AskMessage,
  type AskStoredResult,
} from "~/lib/listings/ask-session";
import { type MapListing } from "~/lib/listings/types";
import { api } from "~/trpc/react";
import { AskCarousel } from "./AskCarousel";

/** Hard client-side ceiling for one Ask (interpret + search + rank). */
const ASK_TIMEOUT_MS = 45_000;

type Phase = "interpreting" | "searching";

function progressText(phase: Phase, elapsed: number, where?: string): string {
  if (phase === "interpreting") return "Understanding your request…";
  const area = where ? ` near ${where}` : "";
  if (elapsed < 5) return `Searching Zigbang, Peterpan and Naver${area}…`;
  if (elapsed < 12) return "Ranking the best matches…";
  return `Still working (${elapsed}s) — live listing sites can be slow.`;
}

function isMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export function AskSearch({
  open,
  viewport,
  currentSnapshot,
  savedIds,
  highlightedId,
  onClose,
  onToggleSave,
  onApplyFilters,
  onShowPicks,
}: {
  open: boolean;
  viewport: { lat: number; lng: number };
  currentSnapshot: SearchSnapshot;
  savedIds: string[];
  highlightedId?: string;
  onClose: () => void;
  onToggleSave: (listing: MapListing) => void;
  /** Explicit button only: Ask never touches the map filters otherwise. */
  onApplyFilters: (snapshot: SearchSnapshot) => void;
  /** Plot picks on the map (and optionally pan to / highlight one). */
  onShowPicks: (picks: AskPick[], focusId?: string) => void;
}) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [constraints, setConstraints] = useState<AskConstraints | null>(null);
  const [result, setResult] = useState<AskStoredResult | null>(null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const restored = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const lastRequest = useRef<(() => void) | null>(null);
  /** Controller of the request in flight; also the synchronous submit lock. */
  const inFlight = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const utils = api.useUtils();
  const pending = phase !== null;

  // Restore the last result after closing/reopening or reloading the tab.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadAskSession();
    if (saved) {
      setMessages(saved.messages);
      setConstraints(saved.constraints);
      setResult(saved.result);
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    saveAskSession({ messages, constraints, result });
  }, [messages, constraints, result]);

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
    if (open) {
      input.current?.focus({ preventScroll: true });
      return;
    }
    cancel();
  }, [open]);
  useEffect(() => () => cancel(), []);

  function cancel() {
    runId.current += 1;
    inFlight.current?.abort("cancelled");
    inFlight.current = null;
    setPhase(null);
  }

  const chips = useMemo(
    () => (constraints ? constraintChips(constraints) : []),
    [constraints],
  );
  const where =
    constraints?.place?.kind === "place"
      ? displayPlace(constraints.place.name)
      : undefined;

  /**
   * One Ask run. `mode`:
   *  - "new"/"refine": interpret the text (with previous constraints for a refine), then rank.
   *  - "rerun": rank the given (edited) constraints directly.
   */
  async function run(options: { text?: string; edited?: AskConstraints }) {
    // Double submit / Enter-then-click is ignored while a request runs.
    if (inFlight.current) return;
    const text = options.text?.trim();
    if (!text && !options.edited) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const myRun = (runId.current += 1);
    const timer = setTimeout(() => controller.abort("timeout"), ASK_TIMEOUT_MS);
    const live = () => runId.current === myRun && !controller.signal.aborted;
    setError(null);
    setNotice(null);
    setApplied(false);

    const history = text
      ? [...messages, { role: "user" as const, content: text }].slice(-8)
      : messages;
    try {
      let working = options.edited ?? null;
      let skipAi: AskFallbackReason | undefined;
      if (text) {
        setPhase("interpreting");
        const interpreted = await utils.client.listings.askInterpret.mutate(
          {
            messages: history,
            previous: result ? (constraints ?? undefined) : undefined,
            viewport,
          },
          { signal: controller.signal },
        );
        if (!live()) return;
        if (interpreted.status === "off_topic") {
          setNotice(interpreted.reply);
          setDraft("");
          return;
        }
        working = interpreted.constraints;
        skipAi = interpreted.fallbackReason;
      }
      if (!working) return;
      setConstraints(working);
      setPhase("searching");
      const answer = await utils.client.listings.ask.mutate(
        { messages: history, constraints: working, viewport, skipAi },
        { signal: controller.signal },
      );
      if (!live()) return;
      if (answer.status === "off_topic") {
        setNotice(answer.reply);
        return;
      }
      setResult(answer);
      setConstraints(answer.constraints);
      setMessages([
        ...history,
        { role: "assistant", content: answer.summary.slice(0, 300) },
      ]);
      setDraft("");
    } catch {
      if (controller.signal.reason === "timeout") {
        setError(
          "That took too long. The listing sites may be slow right now — please try again.",
        );
      } else if (!controller.signal.aborted) {
        setError(
          "Couldn't get picks just now. Check your connection and try again.",
        );
      }
      // Cancelled by the user (close / Cancel): nothing is applied.
    } finally {
      clearTimeout(timer);
      if (inFlight.current === controller) {
        inFlight.current = null;
        if (runId.current === myRun) setPhase(null);
      }
    }
  }

  function submit(text: string) {
    lastRequest.current = () => void run({ text });
    void run({ text });
  }

  function rerun(next: AskConstraints) {
    setConstraints(next);
    lastRequest.current = () => void run({ edited: next });
    void run({ edited: next });
  }

  function newSearch() {
    cancel();
    setMessages([]);
    setConstraints(null);
    setResult(null);
    setNotice(null);
    setError(null);
    setApplied(false);
    setDraft("");
    saveAskSession(null);
    input.current?.focus();
  }

  function showOnMap(picks: AskPick[], focusId?: string) {
    onShowPicks(picks, focusId);
    if (isMobile()) onClose();
  }

  function applyFilters() {
    if (!constraints) return;
    onApplyFilters(
      constraintsToSnapshot(constraints, {
        radiusM: currentSnapshot.radiusM,
        viewMode: currentSnapshot.viewMode,
        searchInput: currentSnapshot.searchInput,
      }),
    );
    setApplied(true);
  }

  if (!open) return null;

  const picks = result?.status === "ok" ? result.picks : [];
  const hasResult = Boolean(result);

  return (
    <>
      <button
        type="button"
        aria-label="Close ask search"
        className="fixed inset-0 z-[1400] bg-slate-950/40 md:hidden"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Ask Ziggybang"
        className={`fixed inset-x-3 bottom-3 z-[1401] flex w-auto max-w-none flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl md:inset-auto md:bottom-3 md:left-3 md:right-auto md:top-3 md:max-h-none md:w-[calc(var(--desktop-panel)-1.5rem)] md:max-w-[calc(40%-1.5rem)] ${
          hasResult || pending ? "max-h-[88dvh]" : "max-h-[min(28rem,58dvh)]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-300">
              Ask Ziggybang
            </p>
            <h2 className="text-sm font-semibold">
              Describe your ideal home — get 10 picks
            </h2>
          </div>
          <div className="flex shrink-0 gap-2">
            {hasResult ? (
              <button
                type="button"
                onClick={newSearch}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
              >
                New search
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!hasResult && !pending && !error ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                Tell me the area, budget, type and what matters — I&apos;ll pick
                the 10 best live listings and say why. Your map filters stay as
                they are.
              </p>
              {ASK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/10"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          {notice ? (
            <p
              role="status"
              className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
            >
              {notice}
            </p>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl bg-rose-400/10 px-3 py-2 text-xs text-rose-100"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={() => lastRequest.current?.()}
                className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
              >
                Try again
              </button>
            </div>
          ) : null}

          {hasResult || (pending && constraints) ? (
            <div className="space-y-2">
              {result &&
              !(pending && phase === "searching" && !picks.length) ? (
                <p className="text-sm leading-snug text-slate-100">
                  {result.summary}
                </p>
              ) : null}
              {chips.length ? (
                <ul
                  aria-label="Interpreted constraints"
                  className="flex flex-wrap gap-1.5"
                >
                  {chips.map((chip) => (
                    <li key={chip.key}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          constraints &&
                          rerun(removeConstraint(constraints, chip.key))
                        }
                        aria-label={`Remove ${chip.label}`}
                        title="Remove this constraint and re-rank"
                        className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-100 hover:bg-sky-400/20 disabled:opacity-50"
                      >
                        {chip.label}
                        <span aria-hidden="true" className="text-sky-300">
                          ×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {result?.fallbackReason ? (
                <p role="status" className="text-[11px] text-amber-300">
                  {askFallbackNotice(result.fallbackReason)}
                </p>
              ) : null}
              {picks.length ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => showOnMap(picks)}
                    disabled={pending}
                    className="rounded-full bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-300 disabled:opacity-50"
                  >
                    Show these on the map
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    disabled={pending}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/20"
                  >
                    Apply as filters
                  </button>
                </div>
              ) : null}
              {result?.assumptions.length ? (
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
                  {result.assumptions.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {pending ? (
            <div role="status" aria-live="polite" className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="flex shrink-0 gap-1" aria-hidden="true">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                  {progressText(phase, elapsed, where)}
                </span>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/20"
                >
                  Cancel
                </button>
              </div>
              {!picks.length ? (
                <div className="flex gap-3 overflow-hidden" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-[min(16.5rem,80%)] shrink-0 animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-slate-900"
                    >
                      <div className="h-32 bg-slate-800" />
                      <div className="space-y-2 p-3">
                        <div className="h-3 w-1/2 rounded bg-slate-800" />
                        <div className="h-3 w-3/4 rounded bg-slate-800" />
                        <div className="h-10 rounded bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {result?.status === "empty" && !pending ? (
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm font-medium text-slate-100">
                No homes matched — try widening your budget or area.
              </p>
              <p className="text-xs text-slate-400">{result.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                {result.suggestions.map((suggestion: AskSuggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() =>
                      constraints &&
                      rerun(applySuggestion(constraints, suggestion.action))
                    }
                    className="rounded-full bg-sky-400 px-3 py-1 text-xs font-medium text-slate-950 hover:bg-sky-300"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {picks.length ? (
            <div
              className={pending ? "pointer-events-none opacity-50" : undefined}
              aria-busy={pending}
            >
              <AskCarousel
                picks={picks}
                savedIds={new Set(savedIds)}
                highlightedId={highlightedId}
                onToggleSave={onToggleSave}
                onShowOnMap={(pick) => showOnMap(picks, pick.listing.id)}
              />
              <p className="mt-1.5 text-[11px] text-slate-500" role="status">
                {applied
                  ? "Filters applied to the map (area, budget, type, floor, building age)."
                  : `${result?.status === "ok" ? result.candidateCount : 0} homes matched; these are the best ${picks.length}. Your map filters are unchanged.`}
              </p>
            </div>
          ) : null}
        </div>

        <form
          className="border-t border-white/10 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <label className="block">
            <span className="sr-only">
              {hasResult ? "Refine your picks" : "Describe the home you want"}
            </span>
            <input
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                hasResult
                  ? "Refine: “only with elevator”, “cheaper”, “closer to the station”…"
                  : "e.g. cheap studio near Hongdae under 700k monthly, quiet"
              }
              autoComplete="off"
              maxLength={500}
              className="search-input w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="rounded-full bg-sky-400 px-3 py-1 text-xs font-medium text-slate-950 disabled:opacity-40"
            >
              {hasResult ? "Refine" : "Find 10 homes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
