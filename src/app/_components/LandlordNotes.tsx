"use client";

import { useState } from "react";
import { useI18n } from "~/lib/i18n/react";
import { sourceText } from "~/lib/listings/copy";
import { hasHangul } from "~/lib/listings/foreigner";
import { glossaryTerms } from "~/lib/listings/glossary";
import { type Source } from "~/lib/listings/types";
import { api } from "~/trpc/react";

/**
 * The landlord's own text. Korean readers always see the original. English
 * readers see the original plus a small glossary of common terms, and — only
 * when the server has OpenAI configured — an optional "Translate description"
 * button (cached on the server, short timeout; nothing is sent until clicked).
 */
export function LandlordNotes({
  text,
  source,
  showTitle = true,
}: {
  text: string;
  source: Source;
  showTitle?: boolean;
}) {
  const { lang, t } = useI18n();
  const trimmed = text.trim();
  const korean = hasHangul(trimmed);
  const english = lang === "en";
  const [requested, setRequested] = useState(false);
  const status = api.listings.aiStatus.useQuery(undefined, {
    enabled: english && korean,
    staleTime: 10 * 60 * 1000,
  });
  const query = api.listings.translateNotes.useQuery(
    { text: trimmed },
    {
      enabled: Boolean(trimmed) && korean && english && requested,
      retry: false,
      staleTime: 24 * 60 * 60 * 1000,
    },
  );

  if (!trimmed) return null;

  const translation = query.data?.source === "openai" ? query.data.english?.trim() : undefined;
  const busy = requested && (query.isLoading || query.isFetching);
  const failed = requested && !busy && !translation;
  const terms = english ? glossaryTerms(trimmed).slice(0, 8) : [];
  const canTranslate = english && korean && status.data?.openai === true;
  const body = "mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300";

  return (
    <div>
      {showTitle ? <h3 className="text-sm font-semibold text-white">{t("notes.title")}</h3> : null}
      {translation ? (
        <>
          <p className={body}>{translation}</p>
          <p className="mt-1 text-[11px] text-slate-500">{t("notes.machine")}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
              {t("notes.korean")}
            </summary>
            <p lang="ko" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
              {trimmed}
            </p>
          </details>
        </>
      ) : (
        <>
          <p lang={korean ? "ko" : undefined} className={body}>
            {trimmed}
          </p>
          {terms.length ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              <span className="text-slate-500">{t("notes.glossary")}:</span>
              {terms.map((term) => (
                <span key={term.ko} className="rounded-full bg-white/10 px-2 py-0.5 text-slate-200">
                  <span lang="ko">{term.ko}</span> = {term.en}
                </span>
              ))}
            </p>
          ) : null}
          {canTranslate ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRequested(true)}
              className="mt-2 rounded-full bg-white/10 px-3 py-1 text-[11px] text-sky-300 hover:bg-white/20 disabled:opacity-60"
            >
              {busy ? t("notes.translating") : t("notes.translate")}
            </button>
          ) : null}
          {failed ? (
            <p role="status" className="mt-2 text-[11px] text-slate-500">
              {t("notes.failed", { source: sourceText(lang, source) })}
            </p>
          ) : !canTranslate ? (
            <p className="mt-2 text-[11px] text-slate-500">
              {t("notes.from", { source: sourceText(lang, source) })}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
