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
  if (!src || failed) return null;
  return (
    // Proxied third-party listing photos; next/image would need every host allowlisted.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
