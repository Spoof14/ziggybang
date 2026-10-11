"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type SearchSnapshot } from "~/lib/listings/ai-search";
import { formatCount, type Lang } from "~/lib/i18n";
import { useI18n } from "~/lib/i18n/react";
import {
  askSuggestions,
  applySuggestion,
  askFallbackNotice,
  constraintChips,
  describeAppliedFilters,
  constraintsToSnapshot,
  displayPlace,
  removeConstraint,
  type AskConstraints,
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
import {
  findPreviewListing,
  hasPreviewHistory,
  loadAskUi,
  patchAskUi,
  previewFromSearch,
  previewKey,
  PREVIEW_HISTORY_KEY,
  withPreviewParam,
} from "~/lib/listings/ask-ui";
import { api } from "~/trpc/react";
import { AskCarousel } from "./AskCarousel";
import { AskListingPreview } from "./AskListingPreview";

/** Hard client-side ceiling for one Ask (interpret + search + rank). */
const ASK_TIMEOUT_MS = 45_000;

type Phase = "searching";

function progressText(
  t: ReturnType<typeof useI18n>["t"],
  elapsed: number,
  where?: string,
): string {
  const area = where ? t("ask.progressNear", { where }) : "";
  if (elapsed < 3) return t("ask.progress1", { area });
  if (elapsed < 12) return t("ask.progress2");
  return t("ask.progress3", { s: elapsed });
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
  onClearFilters,
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
  /** The Ask panel covers the filter sidebar, so it offers its own reset. */
  onClearFilters: () => void;
  /** Plot picks on the map (and optionally pan to / highlight one). */
  onShowPicks: (picks: AskPick[], focusId?: string) => void;
}) {
  const { lang, t } = useI18n();
  const [messages, setMessages] = useState<AskMessage[]>([]);
  /** Language the current result text was produced in. */
  const [resultLang, setResultLang] = useState<Lang>(lang);
  const [constraints, setConstraints] = useState<AskConstraints | null>(null);
  const [result, setResult] = useState<AskStoredResult | null>(null);
  const [draft, setDraft] = useState("");
  const [runKey, setRunKey] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const restored = useRef(false);
  const [preview, setPreview] = useState<MapListing | null>(null);
  /** Carousel slide restored from session storage (only for the restored result). */
  const [startIndex, setStartIndex] = useState(0);
  const activeIndex = useRef(0);
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
      if (saved.lang) setResultLang(saved.lang);
      const ui = loadAskUi();
      const restoredPicks = saved.result?.status === "ok" ? saved.result.picks : [];
      if (ui && restoredPicks.length) {
        const index = Math.min(ui.index, restoredPicks.length - 1);
        setStartIndex(index);
        activeIndex.current = index;
      }
      // ?preview=<source>:<type>:<id> reopens the in-app preview (e.g. Back from the full page).
      const ref = previewFromSearch(window.location.search);
      const pick = findPreviewListing(restoredPicks, ref);
      if (pick) setPreview(pick.listing);
      else if (ref) dropPreviewParam();
    } else if (previewFromSearch(window.location.search)) {
      dropPreviewParam();
    }
  }, []);

  function dropPreviewParam() {
    const search = withPreviewParam(window.location.search, null);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}`);
  }

  function openPreview(listing: MapListing) {
    if (preview) return;
    setPreview(listing);
    const key = previewKey(listing);
    window.history.pushState(
      { ...(window.history.state as Record<string, unknown> | null), [PREVIEW_HISTORY_KEY]: key },
      "",
      `${window.location.pathname}${withPreviewParam(window.location.search, key)}`,
    );
  }

  function closePreview() {
    if (!preview) return;
    if (hasPreviewHistory(window.history.state)) {
      // popstate (below) closes it, so browser Back and this button behave alike.
      window.history.back();
      return;
    }
    setPreview(null);
    dropPreviewParam();
  }

  // Browser Back/Forward drives the preview from the URL.
  const previewPicks = result?.status === "ok" ? result.picks : null;
  useEffect(() => {
    function onPop() {
      const ref = previewFromSearch(window.location.search);
      const pick = previewPicks ? findPreviewListing(previewPicks, ref) : null;
      setPreview(pick ? pick.listing : null);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [previewPicks]);

  // The preview belongs to the open Ask panel and the current result.
  useEffect(() => {
    if (!open && preview) {
      setPreview(null);
      if (previewFromSearch(window.location.search)) dropPreviewParam();
    }
  }, [open, preview]);

  useEffect(() => {
    if (!restored.current) return;
    saveAskSession({ messages, constraints, result, lang: resultLang });
  }, [messages, constraints, result, resultLang]);

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
    () => (constraints ? constraintChips(constraints, lang) : []),
    [constraints, lang],
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
      // One round trip: the server interprets (merging into the previous
      // constraints for a refine) and ranks. Chip edits send constraints.
      setPhase("searching");
      if (options.edited) setConstraints(options.edited);
      const answer = await utils.client.listings.ask.mutate(
        text
          ? {
              messages: history,
              previous: result ? (constraints ?? undefined) : undefined,
              viewport,
              lang,
            }
          : { messages: history, constraints: options.edited, viewport, lang },
        { signal: controller.signal },
      );
      if (!live()) return;
      if (answer.status === "off_topic" && text) {
        setDraft("");
      }
      if (answer.status === "off_topic") {
        setNotice(answer.reply);
        return;
      }
      setResult(answer);
      setResultLang(lang);
      setStartIndex(0);
      activeIndex.current = 0;
      patchAskUi({ index: 0 });
      setRunKey((n) => n + 1);
      setConstraints(answer.constraints);
      setMessages([
        ...history,
        { role: "assistant", content: answer.summary.slice(0, 300) },
      ]);
      setDraft("");
    } catch {
      if (controller.signal.reason === "timeout") {
        setError(t("ask.timeout"));
      } else if (!controller.signal.aborted) {
        setError(t("ask.failed"));
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

  // Switching language re-ranks the same constraints so the summary and
  // reasons are rewritten in the new UI language.
  useEffect(() => {
    if (!result || !constraints || resultLang === lang || inFlight.current) return;
    rerun(constraints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

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
    setStartIndex(0);
    activeIndex.current = 0;
    patchAskUi({ index: 0 });
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
  // While the listing preview is open, everything behind it is inert and hidden from AT.
  const behind = preview ? ({ inert: "", "aria-hidden": true } as Record<string, unknown>) : {};

  return (
    <>
      <button
        type="button"
        aria-label={t("ask.closeAria")}
        className="fixed inset-0 z-[1400] bg-slate-950/40 md:hidden"
        onClick={onClose}
        {...behind}
      />
      <div
        role="dialog"
        aria-label={t("ask.dialog")}
        {...behind}
        className={`${preview ? "max-md:invisible " : ""}fixed inset-x-0 bottom-0 z-[1401] flex w-auto max-w-none flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-950 shadow-2xl sm:inset-x-3 sm:bottom-3 sm:rounded-2xl md:inset-auto md:bottom-3 md:left-3 md:right-auto md:top-3 md:max-h-none md:w-[calc(var(--desktop-panel)-1.5rem)] md:max-w-[calc(40%-1.5rem)] ${
          hasResult || pending ? "max-h-[92dvh] sm:max-h-[88dvh]" : "max-h-[min(28rem,58dvh)]"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:items-start sm:gap-3 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <p className="hidden text-[10px] uppercase tracking-[0.18em] text-sky-300 sm:block">
              {t("ask.eyebrow")}
            </p>
            <h2 className="truncate text-sm font-semibold sm:whitespace-normal sm:break-words sm:leading-snug">
              <span className="text-sky-300 sm:hidden">{t("ask.titleAsk")}</span>
              <span className="sm:hidden">{t("ask.titleShort")}</span>
              <span className="hidden sm:inline">{t("ask.titleLong")}</span>
            </h2>
          </div>
          <div className="flex shrink-0 gap-2">
            {hasResult ? (
              <button
                type="button"
                onClick={newSearch}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
              >
                {t("ask.newSearch")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/20"
            >
              {t("ask.close")}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          {!hasResult && !pending && !error ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                {t("ask.intro")}
              </p>
              {askSuggestions(lang).map((suggestion) => (
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
                {t("ask.tryAgain")}
              </button>
            </div>
          ) : null}

          {hasResult || (pending && constraints) ? (
            // On short screens (zoomed in) the cards come first, details after.
            <div className="space-y-2 [@media(max-height:520px)]:order-2">
              {result &&
              !(pending && phase === "searching" && !picks.length) ? (
                <div>
                  <p
                    className={`text-sm leading-snug text-slate-100 ${summaryOpen ? "" : "line-clamp-3 sm:line-clamp-none"}`}
                  >
                    {result.summary}
                  </p>
                  {result.summary.length > 120 ? (
                    <button
                      type="button"
                      onClick={() => setSummaryOpen((open) => !open)}
                      aria-expanded={summaryOpen}
                      className="text-[11px] text-sky-300 hover:underline sm:hidden"
                    >
                      {summaryOpen ? t("ask.less") : t("ask.more")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {chips.length ? (
                <ul
                  aria-label={t("ask.chipsLabel")}
                  className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
                >
                  {chips.map((chip) => (
                    <li key={chip.key} className="shrink-0">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          constraints &&
                          rerun(removeConstraint(constraints, chip.key))
                        }
                        aria-label={t("ask.chipRemove", { label: chip.label })}
                        title={t("ask.chipRemoveTitle")}
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
                  {askFallbackNotice(result.fallbackReason, lang)}
                </p>
              ) : null}
              {picks.length ? (
                <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  <button
                    type="button"
                    onClick={() => showOnMap(picks)}
                    disabled={pending}
                    className="shrink-0 whitespace-nowrap rounded-full bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-300 disabled:opacity-50"
                  >
                    {t("ask.showOnMap")}
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    disabled={pending}
                    className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/20"
                  >
                    {t("ask.applyFilters")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClearFilters();
                      setApplied(false);
                    }}
                    disabled={pending}
                    className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs text-slate-300 underline-offset-2 hover:text-white hover:underline"
                  >
                    {t("ask.clearMapFilters")}
                  </button>
                </div>
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
                  {progressText(t, elapsed, where)}
                </span>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/20"
                >
                  {t("ask.cancel")}
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
                {t("ask.noMatch")}
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
              className={`[@media(max-height:520px)]:order-1 ${pending ? "pointer-events-none opacity-50" : ""}`}
              aria-busy={pending}
            >
              <AskCarousel
                key={runKey}
                picks={picks}
                savedIds={new Set(savedIds)}
                highlightedId={highlightedId}
                onToggleSave={onToggleSave}
                onShowOnMap={(pick) => showOnMap(picks, pick.listing.id)}
                onPreview={(pick) => openPreview(pick.listing)}
                initialIndex={startIndex}
                onActiveChange={(index) => {
                  activeIndex.current = index;
                  patchAskUi({ index });
                }}
              />
              <p className="mt-1.5 text-[11px] text-slate-500" role="status">
                {applied
                  ? constraints
                    ? describeAppliedFilters(constraints, lang)
                    : t("ask.filtersApplied")
                  : t("ask.matched", {
                      n: formatCount(result?.status === "ok" ? result.candidateCount : 0, lang),
                      picks: picks.length,
                    })}
              </p>
              {result?.assumptions.length ? (
                <details className="mt-1 text-[11px] text-slate-400">
                  <summary className="cursor-pointer select-none hover:text-slate-200">
                    {t("ask.notes", { n: result.assumptions.length })}
                  </summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {result.assumptions.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

        <form
          className="flex items-center gap-2 border-t border-white/10 p-2 sm:block sm:p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <label className="block min-w-0 flex-1">
            <span className="sr-only">
              {hasResult ? t("ask.refineLabel") : t("ask.describeLabel")}
            </span>
            <input
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                hasResult ? t("ask.refinePh") : t("ask.describePh")
              }
              autoComplete="off"
              maxLength={500}
              className="search-input w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
            />
          </label>
          <div className="flex shrink-0 justify-end sm:mt-2">
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="rounded-full bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-40"
            >
              {hasResult ? t("ask.refine") : t("ask.find")}
            </button>
          </div>
        </form>
      </div>
      {preview ? (
        <AskListingPreview
          listing={preview}
          saved={savedIds.includes(preview.id)}
          onClose={closePreview}
          onToggleSave={onToggleSave}
        />
      ) : null}
    </>
  );
}
