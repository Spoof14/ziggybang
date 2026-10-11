"use client";

import { useEffect, useState } from "react";
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
  title,
}: {
  text: string;
  source: Source;
  showTitle?: boolean;
  /** The agent's headline: translated together with the description and shown with it. */
  title?: string;
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
  const headline = title?.trim() ?? "";
  const utils = api.useUtils();
  const query = api.listings.translateBundle.useQuery(
    { title: headline, text: trimmed },
    {
      enabled: Boolean(trimmed) && (korean || hasHangul(headline)) && english && requested,
      retry: false,
      staleTime: 24 * 60 * 60 * 1000,
    },
  );
  // The headline in the page header picks up the same translation without another request.
  const bundledTitle = query.data?.source === "openai" ? query.data.englishTitle?.trim() : undefined;
  useEffect(() => {
    if (bundledTitle && headline) {
      utils.listings.translateTitle.setData({ text: headline }, { english: bundledTitle, source: "openai" });
    }
  }, [bundledTitle, headline, utils]);

  const busy = requested && (query.isLoading || query.isFetching);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!busy) {
      setSecs(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setSecs(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  if (!trimmed) return null;

  const translation = query.data?.source === "openai" ? query.data.english?.trim() : undefined;
  const failed = requested && !busy && !translation;
  const terms = english ? glossaryTerms(trimmed).slice(0, 8) : [];
  const canTranslate = english && korean && status.data?.openai === true;
  const body = "mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300";

  return (
    <div>
      {showTitle ? <h3 className="text-sm font-semibold text-white">{t("notes.title")}</h3> : null}
      {translation ? (
        <>
          {bundledTitle ? <p className="mt-2 text-sm font-medium text-slate-200">{bundledTitle}</p> : null}
          <p className={bundledTitle ? body.replace("mt-2", "mt-1") : body}>{translation}</p>
          <p className="mt-1 text-[11px] text-slate-500">{t("notes.machine")}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
              {t("notes.korean")}
            </summary>
            <p lang="ko" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
              {headline ? `${headline}\n\n` : ""}
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
              onClick={() => (requested ? void query.refetch() : setRequested(true))}
              className="mt-2 rounded-full bg-white/10 px-3 py-1 text-[11px] text-sky-300 hover:bg-white/20 disabled:opacity-60"
            >
              {busy
                ? secs >= 2
                  ? t("notes.translatingSecs", { s: secs })
                  : t("notes.translating")
                : failed
                  ? t("notes.retry")
                  : t("notes.translate")}
            </button>
          ) : null}
          {failed ? (
            <p role="status" className="mt-2 text-[11px] text-slate-500">
              {query.data?.reason === "timeout"
                ? t("notes.timeout")
                : t("notes.failed", { source: sourceText(lang, source) })}
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
