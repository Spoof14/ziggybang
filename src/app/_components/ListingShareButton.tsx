"use client";

import { useState } from "react";
import { shareListing } from "~/lib/listings/share";
import { type MapListing } from "~/lib/listings/types";

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 4v10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 7.5 12 4l3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ListingShareButton({
  listing,
  title,
  labeled = false,
  className,
}: {
  listing: MapListing;
  title?: string;
  labeled?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const result = await shareListing(listing, { title });
    if (result !== "copied") return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const label = copied ? "Link copied" : "Share listing";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void onShare();
      }}
      className={className}
      aria-label={label}
      title={label}
    >
      {labeled ? copied ? "Copied" : "Share" : copied ? "✓" : <ShareIcon />}
    </button>
  );
}
