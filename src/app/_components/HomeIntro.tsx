"use client";

import { useI18n } from "~/lib/i18n/react";

/**
 * Visually hidden h1 + intro. Server-rendered in the language resolved from
 * ?lang= / cookie (LangProvider's initialLang), and updated on the client when
 * the language is switched or only known from localStorage.
 */
export function HomeIntro() {
  const { t } = useI18n();
  return (
    <div className="sr-only">
      <h1>{t("app.h1")}</h1>
      <p>{t("app.intro")}</p>
    </div>
  );
}
