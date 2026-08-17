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
import { type MapListing } from "~/lib/listings/types";

export function ListingPanel({
  listing,
  onClose,
}: {
  listing: MapListing;
  onClose: () => void;
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
  const price = formatPrice(detail);
  const area = formatArea(detail.areaM2);
  const floor = formatFloor(detail.floor);
  const roomType = formatRoomType(detail.roomType);
  const manageCost = formatKrwFromManwon(detail.manageCost);

  return (
    <aside className="pointer-events-auto absolute bottom-4 left-4 right-4 z-[500] max-h-[45vh] overflow-auto rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur md:bottom-6 md:left-auto md:right-6 md:w-[360px]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {sourceLabel[listing.source]} · {propertyTypeLabel[listing.propertyType]}
            {detail.salesType ? ` · ${salesTypeLabel[detail.salesType]}` : ""}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">
            {detail.title ??
              `${propertyTypeLabel[listing.propertyType]} ${listing.sourceId}`}
          </h2>
          {detail.salesType ? (
            <p className="mt-1 text-xs text-slate-400">
              {salesTypeHint[detail.salesType]}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/20"
        >
          Close
        </button>
      </div>

      {detail.thumbnail ? (
        <img
          src={detail.thumbnail}
          alt={detail.title ?? "listing"}
          className="mb-3 h-40 w-full rounded-xl object-cover"
        />
      ) : null}

      <dl className="grid grid-cols-2 gap-2 text-sm">
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
        <p className="mt-3 text-sm text-slate-400">Loading listing details…</p>
      ) : null}

      <a
        href={detail.url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
      >
        Open original listing
      </a>
    </aside>
  );
}
