"use client";

import {
  ageToneClass,
  formatRelativeListed,
  listingAgeTone,
} from "~/lib/listings/age";
import { useI18n } from "~/lib/i18n/react";
import { useNowAfterMount } from "~/lib/use-now";

export function ListingAgeDot({
  updatedAt,
  className = "",
}: {
  updatedAt?: string;
  className?: string;
}) {
  const { lang, t } = useI18n();
  const now = useNowAfterMount();
  const tone = now == null ? undefined : listingAgeTone(updatedAt, now);
  if (!tone) return null;
  // Relative text depends on the clock: only after mount, so server and client markup agree.
  const label = formatRelativeListed(updatedAt, now!, lang) ?? t("ago.listingAge");
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${ageToneClass[tone]} ${className}`}
      title={label}
      aria-label={label}
    />
  );
}
