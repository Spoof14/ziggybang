"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { listingPagePath, stashListing } from "~/lib/listings/path";
import { type MapListing } from "~/lib/listings/types";

export function ListingPageLink({
  listing,
  className,
  children,
}: {
  listing: MapListing;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={listingPagePath(listing)}
      onClick={() => stashListing(listing)}
      className={className}
    >
      {children}
    </Link>
  );
}
