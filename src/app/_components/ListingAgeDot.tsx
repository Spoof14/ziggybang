"use client";

import {
  ageToneClass,
  formatRelativeListed,
  listingAgeTone,
} from "~/lib/listings/age";

export function ListingAgeDot({
  updatedAt,
  className = "",
}: {
  updatedAt?: string;
  className?: string;
}) {
  const tone = listingAgeTone(updatedAt);
  if (!tone) return null;
  const label = formatRelativeListed(updatedAt) ?? "Listing age";
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${ageToneClass[tone]} ${className}`}
      title={label}
      aria-label={label}
    />
  );
}
