import { listingPageUrl } from "./path";
import { type MapListing } from "./types";

export type ShareListingResult = "shared" | "copied" | "cancelled";

function shareTitle(
  listing: Pick<MapListing, "title">,
  title?: string,
): string {
  return title?.trim() || listing.title?.trim() || "Ziggybang listing";
}

async function copyUrl(url: string): Promise<"copied"> {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt("Copy this listing link", url);
  }
  return "copied";
}

export async function shareListing(
  listing: Pick<MapListing, "source" | "propertyType" | "sourceId" | "title">,
  options?: { title?: string; origin?: string },
): Promise<ShareListingResult> {
  const origin =
    options?.origin ??
    (typeof window === "undefined" ? "" : window.location.origin);
  const url = listingPageUrl(listing, origin);
  const title = shareTitle(listing, options?.title);
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
  return copyUrl(url);
}
