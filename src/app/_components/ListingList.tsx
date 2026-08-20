"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  propertyTypeLabel,
  salesTypeFilterLabel,
  sourceLabel,
} from "~/lib/listings/copy";
import { englishCardTitle, listingCardMeta } from "~/lib/listings/english";
import { detectForeignerOk } from "~/lib/listings/foreigner";
import { type ListSort } from "~/lib/listings/prefs";
import { type RankedListing } from "~/lib/listings/recommend";
import { type MapListing } from "~/lib/listings/types";
import { ForeignerBadge } from "./ForeignerBadge";
import { ListingAgeDot } from "./ListingAgeDot";
import { ListingPageLink } from "./ListingPageLink";
import { ListingPhoto } from "./ListingPhoto";
import { ListingPrice } from "./ListingPrice";

const SORT_OPTIONS: Array<{ id: ListSort; label: string }> = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "deposit", label: "Deposit" },
  { id: "monthly", label: "Monthly" },
  { id: "size", label: "Size" },
];

function sortValue(listing: MapListing, sort: ListSort): number {
  if (sort === "newest") {
    const stamp = listing.updatedAt ? Date.parse(listing.updatedAt) : 0;
    return Number.isFinite(stamp) ? -stamp : 0;
  }
  if (sort === "deposit") return listing.deposit ?? Number.POSITIVE_INFINITY;
  if (sort === "monthly") return listing.rent ?? Number.POSITIVE_INFINITY;
  if (sort === "size") return -(listing.areaM2 ?? 0);
  if (listing.salesType === "sale") return listing.price ?? Number.POSITIVE_INFINITY;
  if (listing.rent != null) return (listing.deposit ?? 0) + listing.rent * 12;
  if (listing.deposit != null) return listing.deposit;
  return Number.POSITIVE_INFINITY;
}

export function ListingList({
  listings,
  selectedId,
  loading,
  truncated,
  totalCount,
  sort,
  savedIds,
  canLoadMore,
  loadingMore,
  emptyHint,
  ranked,
  recommendHint,
  onSort,
  onSelect,
  onToggleSave,
  onLoadMore,
}: {
  listings: MapListing[];
  selectedId?: string;
  loading?: boolean;
  truncated?: boolean;
  totalCount?: number;
  sort: ListSort;
  savedIds: string[];
  canLoadMore?: boolean;
  loadingMore?: boolean;
  emptyHint?: string;
  ranked?: RankedListing[];
  recommendHint?: string;
  onSort: (sort: ListSort) => void;
  onSelect: (listing: MapListing) => void;
  onToggleSave: (listing: MapListing) => void;
  onLoadMore?: () => void;
}) {
  const sorted = useMemo(() => {
    if (ranked?.length) return ranked.map((item) => item.listing);
    const items = listings.slice();
    if (sort === "featured") return items;
    return items.sort((a, b) => sortValue(a, sort) - sortValue(b, sort));
  }, [listings, ranked, sort]);
  const reasonsById = useMemo(() => {
    const next = new Map<string, RankedListing>();
    for (const item of ranked ?? []) next.set(item.listing.id, item);
    return next;
  }, [ranked]);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadLock = useRef(false);

  useEffect(() => {
    loadLock.current = false;
  }, [listings.length, canLoadMore]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !canLoadMore || !onLoadMore) return;
    const root = node.closest("[data-list-scroll]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadLock.current) return;
        loadLock.current = true;
        onLoadMore();
      },
      { root: root instanceof Element ? root : null, rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, onLoadMore, sorted.length]);

  const countLabel = loading
    ? "Loading homes…"
    : truncated && totalCount && totalCount > sorted.length
      ? `${sorted.length.toLocaleString("en-US")} of ${totalCount.toLocaleString("en-US")} homes`
      : `${sorted.length.toLocaleString("en-US")} homes`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div className="flex flex-col gap-2 px-3 pt-2">
        <p className="text-xs text-slate-400">{countLabel}</p>
        {recommendHint ? (
          <p className="text-[11px] leading-snug text-sky-300">{recommendHint}</p>
        ) : null}
        {ranked ? null : (
        <div className="flex flex-wrap gap-1">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSort(option.id)}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                sort === option.id ? "bg-white text-slate-950" : "bg-white/10 text-slate-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        )}
      </div>
      {!sorted.length ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-400">
          {loading
            ? "Loading homes in this area…"
            : emptyHint ??
              "No homes in the current map area. Search a neighborhood, draw a shape, or zoom in."}
        </div>
      ) : (
        <div data-list-scroll className="min-h-0 flex-1 overflow-auto p-3">
          <ul className="space-y-2">
            {sorted.map((listing, index) => {
              const title = englishCardTitle(listing);
              const meta = listingCardMeta(listing);
              const saved = savedIds.includes(listing.id);
              const rankedItem = reasonsById.get(listing.id);
              const foreignerOk =
                listing.foreignerOk ??
                detectForeignerOk(listing.title, listing.description);
              const showForeignerBadge =
                foreignerOk === true &&
                !rankedItem?.reasons.includes("Foreigners welcome");
              return (
                <li key={listing.id}>
                  <div
                    className={`flex w-full gap-3 rounded-2xl border p-2 ${
                      selectedId === listing.id
                        ? "border-sky-400 bg-sky-400/10"
                        : "border-white/10 bg-slate-900/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(listing)}
                      className="flex min-w-0 flex-1 gap-3 text-left"
                    >
                      <span className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-white/5">
                        <ListingPhoto
                          url={listing.thumbnail}
                          alt=""
                          width={400}
                          className="h-20 w-24 object-cover"
                        />
                        {rankedItem ? (
                          <span className="absolute left-1 top-1 rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-slate-950">
                            {index + 1}
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1">
                          <ListingAgeDot updatedAt={listing.updatedAt} />
                          <span className="text-[11px] uppercase tracking-wide text-slate-400">
                            {propertyTypeLabel[listing.propertyType]}
                            {listing.salesType
                              ? ` · ${salesTypeFilterLabel[listing.salesType]}`
                              : ""}
                          </span>
                          {showForeignerBadge ? <ForeignerBadge ok /> : null}
                        </span>
                        <ListingPrice
                          listing={listing}
                          className="mt-1 text-sm font-medium leading-snug text-white"
                        />
                        <span className="mt-1 block truncate text-xs text-slate-400">
                          {title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {meta || "Tap for details"}
                        </span>
                        {rankedItem?.reasons.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {rankedItem.reasons.map((reason) => (
                              <span
                                key={reason}
                                className="rounded-full bg-sky-400/15 px-1.5 py-0.5 text-[10px] text-sky-200"
                              >
                                {reason}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <span className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => onToggleSave(listing)}
                        className="rounded-full bg-white/10 px-2 py-1 text-sm"
                        aria-label={saved ? "Unsave home" : "Save home"}
                      >
                        {saved ? "♥" : "♡"}
                      </button>
                      <ListingPageLink
                        listing={listing}
                        className="rounded-full bg-white/10 px-2 py-1 text-center text-[11px] text-sky-300"
                      >
                        Page
                      </ListingPageLink>
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-white/10 px-2 py-1 text-center text-[11px] text-slate-300"
                      >
                        {sourceLabel[listing.source]} ↗
                      </a>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {canLoadMore ? (
            <>
              <div ref={sentinel} className="h-4" />
              <button
                type="button"
                onClick={onLoadMore}
                className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white"
              >
                {loadingMore ? "Loading more…" : "Load more homes"}
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
