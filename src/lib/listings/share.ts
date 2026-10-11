import { DEFAULT_LANG, t, type Lang } from "~/lib/i18n";
import { listingPageUrl } from "./path";
import { type MapListing } from "./types";

export type ShareListingResult = "shared" | "copied" | "cancelled";

function shareTitle(
  listing: Pick<MapListing, "title">,
  title?: string,
  lang: Lang = DEFAULT_LANG,
): string {
  const explicit = title?.trim();
  if (explicit) return explicit;
  const fromListing = listing.title?.trim();
  if (fromListing) return fromListing;
  return t(lang, "share.defaultTitle");
}

async function copyUrl(url: string, lang: Lang): Promise<"copied"> {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt(t(lang, "share.prompt"), url);
  }
  return "copied";
}

export async function shareListing(
  listing: Pick<MapListing, "source" | "propertyType" | "sourceId" | "title">,
  options?: { title?: string; origin?: string; lang?: Lang },
): Promise<ShareListingResult> {
  const origin =
    options?.origin ??
    (typeof window === "undefined" ? "" : window.location.origin);
  const url = listingPageUrl(listing, origin);
  const lang = options?.lang ?? DEFAULT_LANG;
  const title = shareTitle(listing, options?.title, lang);
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ title, text: title, url });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  return copyUrl(url, lang);
}
