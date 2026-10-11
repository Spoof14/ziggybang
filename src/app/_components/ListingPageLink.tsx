"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { withLangPath } from "~/lib/i18n/lang";
import { useI18n } from "~/lib/i18n/react";
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
  const { lang } = useI18n();
  return (
    <Link
      href={withLangPath(listingPagePath(listing), lang)}
      onClick={() => stashListing(listing)}
      className={className}
    >
      {children}
    </Link>
  );
}
