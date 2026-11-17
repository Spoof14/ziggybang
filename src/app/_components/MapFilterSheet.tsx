"use client";

import { useI18n } from "~/lib/i18n/react";
import { MapFiltersBody } from "./MapFiltersBody";
import { type ComponentProps } from "react";

type BodyProps = ComponentProps<typeof MapFiltersBody>;

export function MapFilterSheet({
  open,
  onClose,
  naverError,
  onHideNaver,
  body,
}: {
  open: boolean;
  onClose: () => void;
  naverError?: { source: string; message: string };
  onHideNaver: (turnOff: boolean) => void;
  body: BodyProps;
}) {
  const { t } = useI18n();
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
        className="desk:hidden fixed inset-x-0 bottom-0 z-[1350] flex max-h-[min(88dvh,100%)] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-950 pb-[max(0px,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950 px-3 py-2">
          <h2 className="text-sm font-semibold">{t("header.filtersShort")}</h2>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => {
                body.clearChipFilters();
              }}
              className="inline-flex min-h-10 items-center rounded-full bg-white/10 px-3 text-[11px] text-slate-300 hover:bg-white/20"
            >
              {t("summary.clear")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center rounded-full bg-sky-400 px-4 text-[11px] font-medium text-slate-950 hover:bg-sky-300"
            >
              {t("panel.close")}
            </button>
          </div>
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
      </div>
    </>
  );
}