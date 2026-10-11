"use client";

import { useI18n } from "~/lib/i18n/react";
import { hasHangul } from "~/lib/listings/foreigner";
import { glossText } from "~/lib/listings/glossary";
import { api } from "~/trpc/react";

/**
 * The agent's free-text headline under the structured title. Korean UI: as
 * written. English UI: a glossary label when every word is known, otherwise
 * the cached machine translation (automatic: it is one short, cheap request
 * and only when the server has OpenAI). Without a translation the original is
 * shown as-is (marked lang="ko"); while it loads nothing is shown, so the
 * Korean never flashes first.
 */
export function ListingSubtitle({ title, className }: { title: string; className?: string }) {
  const { lang, t } = useI18n();
  const text = title.trim();
  const glossed = lang === "en" ? glossText(text, lang) : text;
  const needsTranslation = lang === "en" && hasHangul(glossed);
  const status = api.listings.aiStatus.useQuery(undefined, {
    enabled: needsTranslation,
    staleTime: 10 * 60 * 1000,
  });
  const query = api.listings.translateTitle.useQuery(
    { text },
    {
      enabled: needsTranslation && status.data?.openai === true,
      retry: false,
      staleTime: 24 * 60 * 60 * 1000,
    },
  );
  if (!text) return null;
  if (!needsTranslation) {
    return (
      <p lang={hasHangul(glossed) ? "ko" : undefined} className={className}>
        {glossed}
      </p>
    );
  }
  const translated = query.data?.source === "openai" ? query.data.english?.trim() : undefined;
  if (translated) {
    return (
      <div className={className}>
        <p>{translated}</p>
        <details className="mt-0.5">
          <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
            {t("notes.korean")}
          </summary>
          <p lang="ko" className="mt-1">
            {text}
          </p>
        </details>
      </div>
    );
  }
  const waiting = status.isLoading || (status.data?.openai === true && (query.isLoading || query.isFetching));
  if (waiting) return null;
  return (
    <p lang="ko" className={className}>
      {text}
    </p>
  );
}
