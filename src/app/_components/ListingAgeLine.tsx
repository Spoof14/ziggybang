"use client";

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
  const listed = formatListedAt(updatedAt);
  const relative = formatRelativeListed(updatedAt);
  if (!listed && !relative) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <ListingAgeDot updatedAt={updatedAt} />
      <span>{[listed, relative].filter(Boolean).join(" · ")}</span>
    </span>
  );
}
