"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import {
  formatArea,
  formatFloor,
  formatKrwFromManwon,
  formatPriceLines,
  formatRoomType,
  propertyTypeLabel,
  salesTypeHint,
  salesTypeLabel,
  sourceLabel,
} from "~/lib/listings/copy";
import {
  englishAddressLine,
  englishCardTitle,
  koreanAddressForTaxi,
} from "~/lib/listings/english";
import { agencyFeeCopy } from "~/lib/listings/agency-fee";
import { detectForeignerOk } from "~/lib/listings/foreigner";
import { listingPagePath } from "~/lib/listings/path";
import { listingGalleryUrls } from "~/lib/listings/photo";
import { type MapListing } from "~/lib/listings/types";
import { ForeignerBadge } from "./ForeignerBadge";
import { ListingAgeLine } from "./ListingAgeLine";
import { ListingGallery } from "./ListingGallery";
import { ListingPageLink } from "./ListingPageLink";
import { ListingPrice } from "./ListingPrice";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt("Copy this", value);
    return false;
  }
}

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
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const detailQuery = api.listings.getDetail.useQuery(
    {
      source: listing.source,
      sourceId: listing.sourceId,
      propertyType: listing.propertyType,
    },
    { enabled: listing.source === "zigbang" && listing.propertyType !== "apartment" || listing.source === "naver" },
  );

  const detail = detailQuery.data ?? listing;
  const photos = listingGalleryUrls({
    thumbnail: detail.thumbnail ?? listing.thumbnail,
    photos: detail.photos ?? listing.photos,
  });
  const priceLines = formatPriceLines(detail);
  const area = formatArea(detail.areaM2);
  const floor = formatFloor(detail.floor);
  const roomType = formatRoomType(detail.roomType);
  const manageCost = formatKrwFromManwon(detail.manageCost);
  const englishTitle = englishCardTitle(detail);
  const where = englishAddressLine(detail);
  const taxiAddress = koreanAddressForTaxi(detail.address);
  const description = detail.description?.trim();
  const foreignerOk =
    detail.foreignerOk ?? detectForeignerOk(detail.title, detail.description);
  const agencyFee = agencyFeeCopy(detail);

  async function copy(kind: "address" | "link", value: string) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <aside className="pointer-events-auto fixed inset-0 z-[1350] flex flex-col overflow-auto bg-slate-950 text-slate-100 md:absolute md:inset-auto md:bottom-6 md:left-auto md:right-4 md:top-24 md:max-h-[calc(100dvh-7rem)] md:w-[390px] md:rounded-2xl md:border md:border-white/10 md:shadow-2xl">
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
          <ForeignerBadge ok={foreignerOk} className="mt-2 inline-flex" />
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
        {priceLines.length ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Price</dt>
            <dd className="font-medium">
              <ListingPrice listing={detail} />
            </dd>
          </div>
        ) : null}
        {agencyFee ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Agency fee cap</dt>
            <dd>
              {agencyFee.vatLabel} incl. VAT
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                Legal maximum at {agencyFee.ratePct}%. Who pays is negotiable.
              </span>
            </dd>
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
        {detail.updatedAt ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Listed</dt>
            <dd>
              <ListingAgeLine updatedAt={detail.updatedAt} />
            </dd>
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
        {taxiAddress ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Korean address (for taxis)</dt>
            <dd className="flex items-start justify-between gap-2">
              <span>{taxiAddress}</span>
              <button
                type="button"
                onClick={() => void copy("address", taxiAddress)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-white/20"
              >
                {copied === "address" ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
        ) : null}
        {listing.count && listing.count > 1 ? (
          <div>
            <dt className="text-slate-400">Listings here</dt>
            <dd>{listing.count.toLocaleString("en-US")}</dd>
          </div>
        ) : null}
      </dl>

      {description ? (
        <p className="px-4 pb-2 text-sm leading-relaxed text-slate-300">{description}</p>
      ) : null}

      {detailQuery.isLoading ? (
        <p className="px-4 text-sm text-slate-400">Loading listing details…</p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 p-4">
        <ListingPageLink
          listing={detail}
          className="inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
        >
          Open full page
        </ListingPageLink>
        <a
          href={detail.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
        >
          Open on {sourceLabel[listing.source]}
        </a>
        <button
          type="button"
          onClick={() => void copy("link", `${window.location.origin}${listingPagePath(detail)}`)}
          className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
        >
          {copied === "link" ? "Page link copied" : "Copy page link"}
        </button>
      </div>
    </aside>
  );
}
