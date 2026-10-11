"use client";

import { useI18n } from "~/lib/i18n/react";
import { formatPriceLines } from "~/lib/listings/copy";
import { type MapListing } from "~/lib/listings/types";

export function ListingPrice({
  listing,
  className = "",
}: {
  listing: Pick<MapListing, "salesType" | "deposit" | "rent" | "price">;
  className?: string;
}) {
  const { lang } = useI18n();
  const lines = formatPriceLines(listing, lang);
  if (!lines.length) return null;
  return (
    <span className={className}>
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </span>
  );
}
