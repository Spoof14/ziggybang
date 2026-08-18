"use client";

import { useMemo } from "react";
import {
  formatArea,
  formatPrice,
  propertyTypeLabel,
  salesTypeFilterLabel,
  sourceLabel,
} from "~/lib/listings/copy";
import { englishAddressLine, englishCardTitle } from "~/lib/listings/english";
import { type ListSort } from "~/lib/listings/prefs";
import { type MapListing } from "~/lib/listings/types";
import { ListingPhoto } from "./ListingPhoto";

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
  emptyHint,
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
  emptyHint?: string;
  onSort: (sort: ListSort) => void;
  onSelect: (listing: MapListing) => void;
  onToggleSave: (listing: MapListing) => void;
  onLoadMore?: () => void;
}) {
  const sorted = useMemo(() => {
    const items = listings.slice();
    if (sort === "featured") return items;
    return items.sort((a, b) => sortValue(a, sort) - sortValue(b, sort));
  }, [listings, sort]);

  const countLabel = loading
    ? "Loading homes…"
    : truncated && totalCount && totalCount > sorted.length
      ? `${sorted.length.toLocaleString("en-US")} of ${totalCount.toLocaleString("en-US")} homes`
      : `${sorted.length.toLocaleString("en-US")} homes`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div className="flex flex-col gap-2 px-3 pt-2">
        <p className="text-xs text-slate-400">{countLabel}</p>
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
      </div>
      {!sorted.length ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-400">
          {loading
            ? "Loading homes in this area…"
            : emptyHint ??
              "No homes in the current map area. Search a neighborhood, draw a shape, or zoom in."}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <ul className="space-y-2">
            {sorted.map((listing) => {
              const price = formatPrice(listing);
              const area = formatArea(listing.areaM2);
              const title = englishCardTitle(listing);
              const where = englishAddressLine(listing);
              const saved = savedIds.includes(listing.id);
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
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] uppercase tracking-wide text-slate-400">
                          {propertyTypeLabel[listing.propertyType]}
                          {listing.salesType
                            ? ` · ${salesTypeFilterLabel[listing.salesType]}`
                            : ""}
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium text-white">
                          {price ?? title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-400">
                          {title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {where ?? area ?? "Tap for details"}
                        </span>
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
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-white/10 px-2 py-1 text-center text-[11px] text-sky-300"
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
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white"
            >
              Load more homes
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
