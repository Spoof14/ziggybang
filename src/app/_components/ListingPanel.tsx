"use client";

import { api } from "~/trpc/react";
import {
  formatArea,
  formatFloor,
  formatKrwFromManwon,
  formatPrice,
  formatRoomType,
  propertyTypeLabel,
  salesTypeHint,
  salesTypeLabel,
  sourceLabel,
} from "~/lib/listings/copy";
import { englishAddressLine, englishCardTitle } from "~/lib/listings/english";
import { type MapListing } from "~/lib/listings/types";
import { ListingGallery } from "./ListingGallery";

export function ListingPanel({
  listing,
  saved,
  onClose,
  onToggleSave,
}: {
  listing: MapListing;
  saved?: boolean;
  onClose: () => void;
  onToggleSave?: (listing: MapListing) => void;
}) {
  const detailQuery = api.listings.getDetail.useQuery(
    {
      source: listing.source,
      sourceId: listing.sourceId,
      propertyType: listing.propertyType,
    },
    { enabled: listing.source === "zigbang" && listing.propertyType !== "apartment" },
  );

  const detail = detailQuery.data ?? listing;
  const photos = [
    ...new Set(
      [detail.thumbnail, ...(detail.photos ?? listing.photos ?? [])].filter(
        (url): url is string => Boolean(url),
      ),
    ),
  ];
  const price = formatPrice(detail);
  const area = formatArea(detail.areaM2);
  const floor = formatFloor(detail.floor);
  const roomType = formatRoomType(detail.roomType);
  const manageCost = formatKrwFromManwon(detail.manageCost);
  const englishTitle = englishCardTitle(detail);
  const where = englishAddressLine(detail);

  return (
    <aside className="pointer-events-auto fixed inset-0 z-[1300] flex flex-col overflow-auto bg-slate-950 text-slate-100 md:absolute md:inset-auto md:bottom-6 md:left-auto md:right-4 md:top-24 md:max-h-[calc(100dvh-7rem)] md:w-[390px] md:rounded-2xl md:border md:border-white/10 md:shadow-2xl">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {sourceLabel[listing.source]} · {propertyTypeLabel[listing.propertyType]}
            {detail.salesType ? ` · ${salesTypeLabel[detail.salesType]}` : ""}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">
            {englishTitle !== ""
              ? englishTitle
              : (detail.title ?? `${propertyTypeLabel[listing.propertyType]} ${listing.sourceId}`)}
          </h2>
          {detail.title && detail.title !== englishTitle ? (
            <p className="mt-1 text-xs text-slate-400">{detail.title}</p>
          ) : null}
          {detail.salesType ? (
            <p className="mt-1 text-xs text-slate-400">
              {salesTypeHint[detail.salesType]}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {onToggleSave ? (
            <button
              type="button"
              onClick={() => onToggleSave(detail)}
              className="rounded-full bg-white/10 px-2 py-1 text-sm hover:bg-white/20"
              aria-label={saved ? "Unsave home" : "Save home"}
            >
              {saved ? "♥" : "♡"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/20"
          >
            Close
          </button>
        </div>
      </div>

      <ListingGallery urls={photos} alt={detail.title ?? "listing"} />

      <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
        {price ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Price</dt>
            <dd className="font-medium">{price}</dd>
          </div>
        ) : null}
        {area ? (
          <div>
            <dt className="text-slate-400">Size</dt>
            <dd>{area}</dd>
          </div>
        ) : null}
        {floor ? (
          <div>
            <dt className="text-slate-400">Floor</dt>
            <dd>{floor}</dd>
          </div>
        ) : null}
        {roomType ? (
          <div>
            <dt className="text-slate-400">Layout</dt>
            <dd>{roomType}</dd>
          </div>
        ) : null}
        {manageCost ? (
          <div>
            <dt className="text-slate-400">Maintenance</dt>
            <dd>{manageCost} / month</dd>
          </div>
        ) : null}
        {where ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Area</dt>
            <dd>{where}</dd>
          </div>
        ) : null}
        {detail.address ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Address</dt>
            <dd>{detail.address}</dd>
          </div>
        ) : null}
        {listing.count && listing.count > 1 ? (
          <div>
            <dt className="text-slate-400">Listings here</dt>
            <dd>{listing.count.toLocaleString("en-US")}</dd>
          </div>
        ) : null}
      </dl>

      {detailQuery.isLoading ? (
        <p className="px-4 text-sm text-slate-400">Loading listing details…</p>
      ) : null}

      <div className="mt-auto p-4">
        <a
          href={detail.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
        >
          Open on {sourceLabel[listing.source]}
        </a>
      </div>
    </aside>
  );
}
