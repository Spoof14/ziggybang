"use client";

import { useState } from "react";
import { useI18n } from "~/lib/i18n/react";
import { type SavedSearch } from "~/lib/listings/saved-searches";

export function SavedSearchesPanel({
  searches,
  onApply,
  onRename,
  onDelete,
}: {
  searches: SavedSearch[];
  onApply: (item: SavedSearch) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <section className="shrink-0 border-b border-white/10 bg-slate-950 px-3 py-3" aria-labelledby="saved-searches-heading">
      <h2 id="saved-searches-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("savedSearch.sectionTitle")}
      </h2>
      {searches.length === 0 ? (
        <p className="text-sm text-slate-400">{t("savedSearch.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {searches.map((item) => (
            <li
              key={item.id}
              className="flex items-stretch gap-2 rounded-xl border border-white/10 bg-slate-900/80 p-2"
            >
              {editingId === item.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onRename(item.id, draft);
                    setEditingId(null);
                  }}
                >
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="search-input min-h-10 min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950 px-2 text-sm text-slate-100"
                    aria-label={t("savedSearch.renameAria")}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-sky-400 px-3 text-xs font-semibold text-slate-950"
                  >
                    {t("savedSearch.saveName")}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => onApply(item)}
                  className="min-w-0 flex-1 rounded-lg px-1 text-left hover:bg-white/5"
                >
                  <span className="block truncate text-sm font-medium text-slate-100">{item.name}</span>
                  <span className="block text-[11px] text-slate-400">{t("savedSearch.tapToOpen")}</span>
                </button>
              )}
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setDraft(item.name);
                  }}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-white/10 px-2 text-[11px] text-slate-200"
                >
                  {t("savedSearch.rename")}
                </button>
                <button
                  type="button"
                  aria-label={t("savedSearch.deleteAria")}
                  onClick={() => onDelete(item.id)}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-white/10 px-2 text-[11px] text-rose-300"
                >
                  {t("savedSearch.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}