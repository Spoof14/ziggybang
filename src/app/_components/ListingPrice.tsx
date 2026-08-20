"use client";

import { formatPriceLines } from "~/lib/listings/copy";
import { type MapListing } from "~/lib/listings/types";

export function ListingPrice({
  listing,
  className = "",
}: {
  listing: Pick<MapListing, "salesType" | "deposit" | "rent" | "price">;
  className?: string;
}) {
  const lines = formatPriceLines(listing);
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
