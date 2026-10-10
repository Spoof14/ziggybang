"use client";

import { useState } from "react";
import { listingPhotoUrl } from "~/lib/listings/photo";

export function ListingPhoto({
  url,
  alt,
  width,
  className,
}: {
  url?: string;
  alt: string;
  width?: number;
  className?: string;
}) {
  const src = listingPhotoUrl(url, width);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    // Neutral block so cards never show an unexplained empty tile.
    return (
      <span
        role="img"
        aria-label="No photo available"
        className={`flex items-center justify-center bg-slate-800 text-slate-500 ${className ?? ""}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M10 21v-6h4v6" />
        </svg>
      </span>
    );
  }
  return (
    // Proxied third-party listing photos; next/image would need every host allowlisted.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
