"use client";

import { type RefObject } from "react";
import { useI18n } from "~/lib/i18n/react";
import { type ViewMode } from "~/lib/listings/prefs";
import { LanguageSwitch } from "./LanguageSwitch";

export function MapMobileChrome({
  chromeRef,
  viewMode,
  onViewMode,
  savedCount,
  filterCount,
  onOpenFilters,
  onOpenAsk,
  searchInput,
  onSearchInput,
  onSearchSubmit,
  onClearSearch,
  searchExpanded,
  onToggleSearch,
}: {
  chromeRef: RefObject<HTMLDivElement | null>;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  savedCount: number;
  filterCount: number;
  onOpenFilters: () => void;
  onOpenAsk: () => void;
  searchInput: string;
  onSearchInput: (value: string) => void;
  onSearchSubmit: () => void;
  onClearSearch: () => void;
  searchExpanded: boolean;
  onToggleSearch: () => void;
}) {
  const { t } = useI18n();
  const modes: ViewMode[] = ["map", "list", "best", "saved"];

  return (
    <div
      ref={chromeRef}
      data-mobile-chrome=""
      className="desk:hidden pointer-events-auto fixed inset-x-0 top-0 z-[1300] border-b border-white/10 bg-slate-950/92 backdrop-blur-md"
    >
      <div className="flex items-center gap-1 px-2 pb-2 pt-[max(0.35rem,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label={t("search.label")}
          aria-expanded={searchExpanded}
          onClick={onToggleSearch}
          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-200 hover:bg-white/20"
        >
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
        </button>

        <div
          role="group"
          aria-label={t("header.tagline")}
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar"
        >
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => onViewMode(mode)}
              className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-2.5 text-[11px] font-medium capitalize ${
                viewMode === mode ? "bg-white text-slate-950" : "bg-white/10 text-slate-300"
              }`}
            >
              {mode === "saved" && savedCount
                ? t("view.savedN", { n: savedCount })
                : t(`view.${mode}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          data-filter-toggle=""
          aria-label={t("header.showFilters")}
          onClick={onOpenFilters}
          className="relative inline-flex min-h-10 shrink-0 items-center rounded-full bg-white/10 px-3 text-[11px] font-medium text-slate-200 hover:bg-white/20"
        >
          {t("header.filtersShort")}
          {filterCount > 0 ? (
            <span className="ml-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-sky-400 px-1 text-[10px] font-bold text-slate-950">
              {filterCount > 9 ? "9+" : String(filterCount)}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          aria-label={t("ask.open.aria")}
          onClick={onOpenAsk}
          className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-sky-400 px-2.5 text-[11px] font-semibold text-slate-950 hover:bg-sky-300"
        >
          {t("ask.open")}
        </button>

        <LanguageSwitch className="shrink-0" />
      </div>

      {searchExpanded ? (
        <label className="relative mx-2 mb-2 block">
          <span className="sr-only">{t("search.label")}</span>
          <input
            value={searchInput}
            onChange={(event) => onSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearchSubmit();
              if (event.key === "Escape") onToggleSearch();
            }}
            placeholder={t("search.placeholder")}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="search-input min-h-10 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 pr-16 text-sm text-slate-100 outline-none focus:border-sky-400"
          />
          {searchInput ? (
            <button
              type="button"
              aria-label={t("search.clear.aria")}
              onClick={onClearSearch}
              className="absolute right-1 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-lg text-xs text-slate-400 hover:bg-white/10 hover:text-white"
            >
              {t("search.clear")}
            </button>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}