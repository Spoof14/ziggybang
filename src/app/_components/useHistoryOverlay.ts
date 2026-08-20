"use client";

import { useEffect, useState } from "react";
import {
  listingSheetInHistory,
  listingSheetSyncAction,
  withListingSheet,
} from "~/lib/listings/overlay-history";
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
      window.history.pushState(withListingSheet(window.history.state, true), "");
      return;
    }
    if (action === "back") {
      window.history.back();
    }
  }, [historyReady, sheetOpen]);
}
