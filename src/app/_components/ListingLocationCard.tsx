"use client";

import { Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { hasListingCoords, listingMapLinks } from "~/lib/listings/path";
import { type MapListing } from "~/lib/listings/types";

const MiniMap = dynamic(
  () => import("./ListingMiniMap").then((mod) => mod.ListingMiniMap),
  { ssr: false },
);

type MiniMapGuardProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type MiniMapGuardState = { failed: boolean };

class MiniMapGuard extends Component<MiniMapGuardProps, MiniMapGuardState> {
  state: MiniMapGuardState = { failed: false };

  static getDerivedStateFromError(): MiniMapGuardState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ListingLocationCard({
  listing,
  title,
  compact = false,
}: {
  listing: Pick<MapListing, "lat" | "lng" | "address">;
  title: string;
  compact?: boolean;
}) {
  const links = listingMapLinks(listing, title);
  const hasCoords = hasListingCoords(listing);
  if (!hasCoords && !links.google && !links.kakao && !links.naver) return null;

  return (
    <section
      className={
        compact
          ? "mx-4 mb-1 overflow-hidden rounded-xl border border-white/10"
          : "overflow-hidden rounded-2xl border border-white/10"
      }
    >
      {hasCoords ? (
        <MiniMapGuard fallback={<div className={compact ? "h-40 w-full bg-slate-900" : "h-56 w-full bg-slate-900"} />}>
          <MiniMap
            lat={listing.lat}
            lng={listing.lng}
            className={compact ? "h-40 w-full" : "h-56 w-full"}
          />
        </MiniMapGuard>
      ) : (
        <p className="px-3 pt-3 text-xs text-slate-400">
          Open a map with the listing address.
        </p>
      )}
      <div className="flex flex-wrap gap-2 p-3 text-[11px]">
        {links.google ? (
          <a
            href={links.google}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/20"
          >
            Google Maps
          </a>
        ) : null}
        {links.kakao ? (
          <a
            href={links.kakao}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/20"
          >
            Kakao Map
          </a>
        ) : null}
        {links.naver ? (
          <a
            href={links.naver}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/20"
          >
            Naver Map
          </a>
        ) : null}
      </div>
    </section>
  );
}
