"use client";

import { useI18n } from "~/lib/i18n/react";

export function ForeignerBadge({
  ok,
  className = "",
}: {
  ok?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  if (ok !== true) return null;
  return (
    <span
      className={`rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-200 ${className}`}
    >
      {t("chip.foreigner")}
    </span>
  );
}
