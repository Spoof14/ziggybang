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
