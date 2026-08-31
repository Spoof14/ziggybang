export function listingHasPhotos(listing: {
  thumbnail?: string;
  photos?: string[];
}): boolean {
  if (listing.thumbnail?.trim()) return true;
  return Boolean(listing.photos?.some((url) => url.trim()));
}

/** Gallery order: listing photos first (Naver floor plans live there), then thumbnail. */
export function listingGalleryUrls(listing: {
  thumbnail?: string;
  photos?: string[];
}): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const url of [...(listing.photos ?? []), listing.thumbnail]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function listingPhotoUrl(
  url?: string,
  width = 800,
): string | undefined {
  if (!url) return undefined;
  let next = url.startsWith("//") ? `https:${url}` : url;
  if (next.includes("ic.zigbang.com") && !/[?&][wh]=/i.test(next)) {
    next += `${next.includes("?") ? "&" : "?"}w=${width}`;
  }
  return `/api/media?u=${encodeURIComponent(next)}`;
}

export function uniquePhotoUrls(urls: Array<string | undefined>, width = 800): string[] {
  const seen = new Set<string>();
  const proxied: string[] = [];
  for (const url of urls) {
    const src = listingPhotoUrl(url, width);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    proxied.push(src);
  }
  return proxied;
}

export function preloadListingPhotos(urls: string[]): () => void {
  if (typeof Image === "undefined") return () => undefined;
  const images = urls.map((src) => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    return image;
  });
  return () => {
    for (const image of images) {
      image.src = "";
    }
  };
}
