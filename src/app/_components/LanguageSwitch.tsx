"use client";

import { useI18n } from "~/lib/i18n/react";

/**
 * EN / 한국어 toggle. A real switch (role="switch", aria-checked = Korean) so
 * assistive tech announces its state; the visible labels carry their own lang.
 */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const korean = lang === "ko";
  const seg = (active: boolean) =>
    `rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
      active ? "bg-white text-slate-950" : "text-slate-300"
    }`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={korean}
      aria-label={t("lang.switch")}
      title={t("lang.group")}
      data-lang-switch=""
      onClick={() => setLang(korean ? "en" : "ko")}
      className={`inline-flex items-center gap-0.5 rounded-full bg-white/10 p-0.5 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${className}`}
    >
      <span lang="en" aria-hidden="true" className={seg(!korean)}>
        EN
      </span>
      <span lang="ko" aria-hidden="true" className={seg(korean)}>
        한국어
      </span>
    </button>
  );
}
