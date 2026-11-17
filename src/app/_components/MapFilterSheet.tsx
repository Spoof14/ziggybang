"use client";

import { formatCount } from "~/lib/i18n";
import { useI18n } from "~/lib/i18n/react";
import { type ActiveFilterChip } from "~/lib/listings/active-filter-chips";
import { MapFiltersBody } from "./MapFiltersBody";
import { type ComponentProps } from "react";

type BodyProps = ComponentProps<typeof MapFiltersBody>;

export function MapFilterSheet({
  open,
  onClose,
  naverError,
  onHideNaver,
  body,
  chips,
  onRemoveChip,
  homeCount,
  onSaveSearch,
}: {
  open: boolean;
  onClose: () => void;
  naverError?: { source: string; message: string };
  onHideNaver: (turnOff: boolean) => void;
  body: BodyProps;
  chips: ActiveFilterChip[];
  onRemoveChip: (id: string) => void;
  homeCount: number;
  onSaveSearch?: () => void;
}) {
  const { lang, t } = useI18n();
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t("ask.closeAria")}
        className="desk:hidden fixed inset-0 z-[1340] bg-slate-950/55"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-label={t("header.showFilters")}
        className="desk:hidden fixed inset-x-0 bottom-0 z-[1350] flex max-h-[min(82dvh,100%)] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-950 pb-[max(0px,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="flex flex-col items-center border-b border-white/10 bg-slate-950 px-3 pt-2">
          <span className="mb-2 h-1 w-10 rounded-full bg-white/25" aria-hidden />
          <div className="flex w-full items-center justify-between gap-2 pb-2">
            <h2 className="text-sm font-semibold">{t("header.filtersShort")}</h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center rounded-full bg-white/10 px-3 text-[11px] text-slate-300 hover:bg-white/20"
            >
              {t("panel.close")}
            </button>
          </div>
          {chips.length ? (
            <div className="mb-2 flex w-full gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onRemoveChip(chip.id)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-violet-400/20 px-3 text-[11px] text-violet-100"
                >
                  <span className="max-w-[9rem] truncate">{chip.label}</span>
                  <span aria-hidden className="text-slate-300">
                    ×
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div data-header-panel="" className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <MapFiltersBody {...body} />
          {naverError ? (
            <p className="mt-1.5 flex items-start justify-between gap-2 text-[11px] text-amber-300">
              <span>{naverError.message}</span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center text-slate-400 hover:text-white"
                  onClick={() => onHideNaver(true)}
                >
                  {t("err.turnOff")}
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center text-slate-400 hover:text-white"
                  onClick={() => onHideNaver(false)}
                >
                  Dismiss
                </button>
              </span>
            </p>
          ) : null}
        </div>
        <div className="sticky bottom-0 border-t border-white/10 bg-slate-950/95 px-3 py-2 backdrop-blur-md">
          {onSaveSearch ? (
            <button
              type="button"
              onClick={onSaveSearch}
              className="mb-2 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/15 bg-slate-900 text-sm text-slate-100"
            >
              {t("savedSearch.save")}
            </button>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={body.clearChipFilters}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-white/10 text-sm text-slate-200"
            >
              {t("summary.clear")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 flex-[1.4] items-center justify-center rounded-full bg-sky-400 text-sm font-semibold text-slate-950"
            >
              {t("filters.showHomes", { n: formatCount(homeCount, lang) })}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}