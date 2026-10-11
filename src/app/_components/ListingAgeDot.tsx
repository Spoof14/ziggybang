"use client";

import {
  ageToneClass,
  formatRelativeListed,
  listingAgeTone,
} from "~/lib/listings/age";
import { useI18n } from "~/lib/i18n/react";

export function ListingAgeDot({
  updatedAt,
  className = "",
}: {
  updatedAt?: string;
  className?: string;
}) {
  const { lang, t } = useI18n();
  const tone = listingAgeTone(updatedAt);
  if (!tone) return null;
  const label = formatRelativeListed(updatedAt, Date.now(), lang) ?? t("ago.listingAge");
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${ageToneClass[tone]} ${className}`}
      title={label}
      aria-label={label}
    />
  );
}
