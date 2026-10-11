"use client";

import { useEffect, useId, useRef } from "react";
import { useI18n } from "~/lib/i18n/react";
import { type MapListing } from "~/lib/listings/types";
import { ListingPanel } from "./ListingPanel";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The map's listing detail panel as a modal over the Ask panel: side sheet on
 * desktop, full screen on mobile. Traps focus, closes on Escape and returns
 * focus to the card that opened it.
 */
export function AskListingPreview({
  listing,
  saved,
  onClose,
  onToggleSave,
  onSimilar,
}: {
  listing: MapListing;
  saved: boolean;
  onClose: () => void;
  onToggleSave: (listing: MapListing) => void;
  onSimilar?: (listing: MapListing) => void;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const aside = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    aside.current?.focus({ preventScroll: true });
    const lightbox = () => document.querySelector('[data-photo-lightbox]');
    const onKey = (event: KeyboardEvent) => {
      // The fullscreen photo viewer handles its own Escape.
      if (lightbox()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !aside.current) return;
      const nodes = [...aside.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (!nodes.length) {
        event.preventDefault();
        aside.current.focus();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement;
      if (!aside.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === aside.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div data-ask-preview="">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="fixed inset-0 z-[1499] hidden cursor-default bg-slate-950/50 md:block"
        onClick={onClose}
      />
      <ListingPanel
        listing={listing}
        saved={saved}
        onClose={onClose}
        onToggleSave={onToggleSave}
        onSimilar={onSimilar}
        modal={{ labelId, closeLabel: t("ask.backToPicks"), asideRef: aside }}
      />
    </div>
  );
}
