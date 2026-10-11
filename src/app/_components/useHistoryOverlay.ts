"use client";

import { useEffect, useState } from "react";
import {
  listingSheetInHistory,
  listingSheetSyncAction,
  withListingSheet,
} from "~/lib/listings/overlay-history";
import { previewKey, withPreviewParam } from "~/lib/listings/ask-ui";
import { type MapListing } from "~/lib/listings/types";

const SHEET_LISTING_KEY = "ziggybang:sheet-listing";

export function writeSheetListing(listing: MapListing | null) {
  try {
    if (!listing) {
      window.sessionStorage.removeItem(SHEET_LISTING_KEY);
      return;
    }
    window.sessionStorage.setItem(SHEET_LISTING_KEY, JSON.stringify(listing));
  } catch {
    /* private mode */
  }
}

export function readSheetListing(): MapListing | null {
  try {
    const raw = window.sessionStorage.getItem(SHEET_LISTING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapListing;
    return parsed?.id && parsed.source ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Puts the listing popup on the browser history stack so the native back
 * button closes it instead of leaving the map.
 */
export function useHistoryOverlay({
  selected,
  setSelected,
}: {
  selected: MapListing | null;
  setSelected: (listing: MapListing | null) => void;
}) {
  const [historyReady, setHistoryReady] = useState(false);

  useEffect(() => {
    if (listingSheetInHistory(window.history.state)) {
      const listing = readSheetListing();
      if (listing) setSelected(listing);
    }
    setHistoryReady(true);
  }, [setSelected]);

  useEffect(() => {
    function onPop() {
      if (!listingSheetInHistory(window.history.state)) {
        setSelected(null);
        writeSheetListing(null);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setSelected]);

  useEffect(() => {
    writeSheetListing(selected);
  }, [selected]);

  const sheetOpen = Boolean(selected);

  useEffect(() => {
    if (!historyReady) return;
    const action = listingSheetSyncAction(
      listingSheetInHistory(window.history.state),
      sheetOpen,
    );
    if (action === "push") {
      // ?preview=<source>:<type>:<id> like the Ask flow, so the open listing is in the URL.
      const key = selected ? previewKey(selected) : null;
      window.history.pushState(
        withListingSheet(window.history.state, true),
        "",
        key ? `${window.location.pathname}${withPreviewParam(window.location.search, key)}${window.location.hash}` : undefined,
      );
      return;
    }
    if (action === "back") {
      window.history.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyReady, sheetOpen]);

  // Another listing selected while the sheet stays open: keep ?preview= in step.
  const selectedKey = selected ? previewKey(selected) : null;
  useEffect(() => {
    if (!historyReady || !selectedKey || !listingSheetInHistory(window.history.state)) return;
    const search = withPreviewParam(window.location.search, selectedKey);
    if (search !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [historyReady, selectedKey]);
}
