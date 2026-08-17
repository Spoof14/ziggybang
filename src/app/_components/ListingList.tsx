"use client";

import { useMemo, useState } from "react";
import {
  formatArea,
  formatPrice,
  propertyTypeLabel,
  salesTypeFilterLabel,
} from "~/lib/listings/copy";
import { type MapListing } from "~/lib/listings/types";
import { ListingPhoto } from "./ListingPhoto";

type ListSort = "featured" | "price" | "size";

function priceSortValue(listing: MapListing): number {
  if (listing.salesType === "sale") return listing.price ?? Number.POSITIVE_INFINITY;
  if (listing.rent != null) return (listing.deposit ?? 0) + listing.rent * 12;
  if (listing.deposit != null) return listing.deposit;
  return Number.POSITIVE_INFINITY;
}

export function ListingList({
  listings,
  selectedId,
  loading,
  onSelect,
}: {
  listings: MapListing[];
  selectedId?: string;
  loading?: boolean;
  onSelect: (listing: MapListing) => void;
}) {
  const [sort, setSort] = useState<ListSort>("featured");
  const sorted = useMemo(() => {
    const items = listings.slice();
    if (sort === "price") {
      items.sort((a, b) => priceSortValue(a) - priceSortValue(b));
    } else if (sort === "size") {
      items.sort((a, b) => (b.areaM2 ?? 0) - (a.areaM2 ?? 0));
    }
    return items;
  }, [listings, sort]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <p className="text-xs text-slate-400">
          {loading ? "Updating list…" : `${sorted.length.toLocaleString("en-US")} homes`}
        </p>
        <div className="flex gap-1">
          {(["featured", "price", "size"] as ListSort[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSort(option)}
              className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${
                sort === option ? "bg-white text-slate-950" : "bg-white/10 text-slate-300"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      {!sorted.length ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-400">
          No listings in this area. Search a neighborhood, draw a shape, or zoom
          in.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <ul className="space-y-2">
            {sorted.map((listing) => {
              const price = formatPrice(listing);
              const area = formatArea(listing.areaM2);
              return (
                <li key={listing.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(listing)}
                    className={`flex w-full gap-3 rounded-2xl border p-2 text-left ${
                      selectedId === listing.id
                        ? "border-sky-400 bg-sky-400/10"
                        : "border-white/10 bg-slate-900/80"
                    }`}
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
                        {price ?? listing.title ?? "Open listing"}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-400">
                        {listing.address ?? area ?? "Tap for details"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
