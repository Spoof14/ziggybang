"use client";

import { useI18n } from "~/lib/i18n/react";
import { useNowAfterMount } from "~/lib/use-now";
import { formatRelativeListed } from "~/lib/listings/age";
import { formatListedAt } from "~/lib/listings/detail-copy";
import { ListingAgeDot } from "./ListingAgeDot";

export function ListingAgeLine({
  updatedAt,
  className = "",
}: {
  updatedAt?: string;
  className?: string;
}) {
  const { lang } = useI18n();
  const listed = formatListedAt(updatedAt, lang);
  const now = useNowAfterMount();
  const relative = now == null ? null : formatRelativeListed(updatedAt, now, lang);
  if (!listed && !relative) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <ListingAgeDot updatedAt={updatedAt} />
      <span>{[listed, relative].filter(Boolean).join(" · ")}</span>
    </span>
  );
}
