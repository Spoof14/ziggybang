"use client";

import { useState, type Ref } from "react";
import { api } from "~/trpc/react";
import { useI18n } from "~/lib/i18n/react";
import {
  formatArea,
  formatFloor,
  formatKrwFromManwon,
  formatPriceLines,
  formatRoomType,
  propertyTypeText,
  salesTypeHintText,
  salesTypeText,
  sourceText,
} from "~/lib/listings/copy";
import { glossText } from "~/lib/listings/glossary";
import {
  englishAddressLine,
  englishCardTitle,
  koreanAddressForTaxi,
} from "~/lib/listings/english";
import { agencyFeeCopy } from "~/lib/listings/agency-fee";
import { detectForeignerOk } from "~/lib/listings/foreigner";
import { listingPagePath, mergeListingDetail, hasListingCoords } from "~/lib/listings/path";
import { listingGalleryUrls } from "~/lib/listings/photo";
import { type MapListing } from "~/lib/listings/types";
import { ForeignerBadge } from "./ForeignerBadge";
import { ListingAgeLine } from "./ListingAgeLine";
import { LandlordNotes } from "./LandlordNotes";
import { ListingGallery } from "./ListingGallery";
import { ListingLocationCard } from "./ListingLocationCard";
import { ListingPageLink } from "./ListingPageLink";
import { ListingPrice } from "./ListingPrice";
import { ListingShareButton } from "./ListingShareButton";

async function copyText(value: string, promptText: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt(promptText, value);
    return false;
  }
}

export function ListingPanel({
  listing,
  saved,
  onClose,
  onToggleSave,
  onSimilar,
  modal,
}: {
  /** "Similar to this": runs Ask anchored on this listing. */
  onSimilar?: (listing: MapListing) => void;
  listing: MapListing;
  saved?: boolean;
  onClose: () => void;
  onToggleSave?: (listing: MapListing) => void;
  /**
   * Render as an accessible modal (side sheet on desktop, full screen on
   * mobile) above other panels, e.g. the Ask panel. The caller owns focus
   * trapping and Escape.
   */
  modal?: { labelId: string; closeLabel: string; asideRef?: Ref<HTMLElement> };
}) {
  const { lang, t } = useI18n();
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const detailQuery = api.listings.getDetail.useQuery(
    {
      source: listing.source,
      sourceId: listing.sourceId,
      propertyType: listing.propertyType,
    },
    { enabled: listing.source === "zigbang" && listing.propertyType !== "apartment" || listing.source === "naver" },
  );

  const detail = mergeListingDetail(detailQuery.data, listing) ?? listing;
  const photos = listingGalleryUrls({
    thumbnail: detail.thumbnail ?? listing.thumbnail,
    photos: detail.photos ?? listing.photos,
  });
  const priceLines = formatPriceLines(detail, lang);
  const area = formatArea(detail.areaM2, lang);
  const floor = formatFloor(detail.floor, lang);
  const roomType = formatRoomType(detail.roomType, lang);
  const manageCost = formatKrwFromManwon(detail.manageCost, lang);
  const englishTitle = englishCardTitle(detail, lang);
  const where = englishAddressLine(detail, lang);
  const taxiAddress = koreanAddressForTaxi(detail.address);
  const description = detail.description?.trim();
  const foreignerOk =
    detail.foreignerOk ?? detectForeignerOk(detail.title, detail.description);
  const agencyFee = agencyFeeCopy(detail, lang);

  async function copy(kind: "address" | "link", value: string) {
    const ok = await copyText(value, t("panel.copyPrompt"));
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <aside
      ref={modal?.asideRef}
      role={modal ? "dialog" : undefined}
      aria-modal={modal ? "true" : undefined}
      aria-labelledby={
        modal ? (priceLines.length ? `${modal.labelId} ${modal.labelId}-price` : modal.labelId) : undefined
      }
      tabIndex={modal ? -1 : undefined}
      className={
        modal
          ? "pointer-events-auto fixed inset-0 z-[1500] flex flex-col overflow-auto overscroll-contain bg-slate-950 text-slate-100 outline-none md:inset-auto md:bottom-4 md:right-4 md:top-4 md:max-h-[calc(100dvh-2rem)] md:w-[min(26rem,calc(100vw-2rem))] md:rounded-2xl md:border md:border-white/10 md:shadow-2xl"
          : "pointer-events-auto fixed inset-0 z-[1350] flex flex-col overflow-auto bg-slate-950 text-slate-100 md:absolute md:inset-auto md:bottom-4 md:left-auto md:right-4 md:top-4 md:max-h-[calc(100dvh-2rem)] md:w-[var(--desktop-panel)] md:max-w-[40%] md:rounded-2xl md:border md:border-white/10 md:shadow-2xl"
      }
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {sourceText(lang, listing.source)} · {propertyTypeText(lang, listing.propertyType)}
            {detail.salesType ? ` · ${salesTypeText(lang, detail.salesType)}` : ""}
          </p>
          <h2 id={modal?.labelId} className="mt-1 text-lg font-semibold leading-snug">
            {englishTitle !== ""
              ? englishTitle
              : (detail.title ?? `${propertyTypeText(lang, listing.propertyType)} ${listing.sourceId}`)}
          </h2>
          {detail.title && detail.title !== englishTitle ? (
            <p lang="ko" className="mt-1 text-xs text-slate-400">
              {lang === "en" ? glossText(detail.title, lang) : detail.title}
            </p>
          ) : null}
          {detail.salesType ? (
            <p className="mt-1 text-xs text-slate-400">
              {salesTypeHintText(lang, detail.salesType)}
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
              aria-label={saved ? t("card.unsave") : t("card.save")}
              aria-pressed={saved}
            >
              {saved ? "♥" : "♡"}
            </button>
          ) : null}
          <ListingShareButton
            listing={detail}
            title={englishTitle}
            className="inline-flex items-center justify-center rounded-full bg-white/10 px-2 py-1 text-sm text-slate-200 hover:bg-white/20"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/20"
          >
            {modal?.closeLabel ?? t("panel.close")}
          </button>
        </div>
      </div>

      <ListingGallery urls={photos} alt={detail.title ?? t("panel.galleryAlt")} />

      <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
        {priceLines.length ? (
          <div className="col-span-2">
            <dt className="text-slate-400">{t("panel.price")}</dt>
            <dd id={modal ? `${modal.labelId}-price` : undefined} className="font-medium">
              <ListingPrice listing={detail} />
            </dd>
          </div>
        ) : null}
        {agencyFee ? (
          <div className="col-span-2">
            <dt className="text-slate-400">{t("panel.agencyCap")}</dt>
            <dd>
              {t("panel.agencyIncl", { amount: agencyFee.vatLabel })}
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                {t("panel.agencyMax", { pct: agencyFee.ratePct })}
              </span>
            </dd>
          </div>
        ) : null}
        {area ? (
          <div>
            <dt className="text-slate-400">{t("panel.exclusiveArea")}</dt>
            <dd>{area}</dd>
          </div>
        ) : null}
        {floor ? (
          <div>
            <dt className="text-slate-400">{t("panel.floor")}</dt>
            <dd>{floor}</dd>
          </div>
        ) : null}
        {detail.updatedAt ? (
          <div className="col-span-2">
            <dt className="text-slate-400">{t("panel.listed")}</dt>
            <dd>
              <ListingAgeLine updatedAt={detail.updatedAt} />
            </dd>
          </div>
        ) : null}
        {roomType ? (
          <div>
            <dt className="text-slate-400">{t("panel.layout")}</dt>
            <dd>{roomType}</dd>
          </div>
        ) : null}
        {manageCost ? (
          <div>
            <dt className="text-slate-400">{t("panel.maintenance")}</dt>
            <dd>{t("panel.perMonth", { amount: manageCost })}</dd>
          </div>
        ) : null}
        {where ? (
          <div className="col-span-2">
            <dt className="text-slate-400">{t("panel.area")}</dt>
            <dd>{where}</dd>
          </div>
        ) : null}
        {taxiAddress ? (
          <div className="col-span-2">
            <dt className="text-slate-400">{t("panel.taxi")}</dt>
            <dd className="flex items-start justify-between gap-2">
              <span>{taxiAddress}</span>
              <button
                type="button"
                onClick={() => void copy("address", taxiAddress)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-white/20"
              >
                {copied === "address" ? t("panel.copiedShort") : t("panel.copy")}
              </button>
            </dd>
          </div>
        ) : null}
        {listing.count && listing.count > 1 ? (
          <div>
            <dt className="text-slate-400">{t("panel.listingsHere")}</dt>
            <dd>{listing.count.toLocaleString("en-US")}</dd>
          </div>
        ) : null}
      </dl>

      {description ? (
        <div className="px-4 pb-2">
          <LandlordNotes text={description} source={listing.source} showTitle={false} />
        </div>
      ) : null}

      {detailQuery.isLoading ? (
        <p className="px-4 text-sm text-slate-400">{t("panel.loadingDetails")}</p>
      ) : null}

      <div className="mt-auto">
        <ListingLocationCard
          listing={hasListingCoords(detail) ? detail : listing}
          title={englishTitle}
          compact
        />
        <div className="flex flex-col gap-2 p-4">
          {onSimilar ? (
            <button
              type="button"
              onClick={() => onSimilar(listing)}
              aria-label={t("ask.similar.aria")}
              className="inline-flex w-full items-center justify-center rounded-xl bg-sky-400/15 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-400/25"
            >
              {t("ask.similar.btn")}
            </button>
          ) : null}
          <ListingPageLink
            listing={detail}
            className="inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
          >
            {t("panel.openFull")}
          </ListingPageLink>
          <a
            href={detail.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
          >
            {t("card.openOn", { source: sourceText(lang, listing.source) })}
          </a>
          <button
            type="button"
            onClick={() => void copy("link", `${window.location.origin}${listingPagePath(detail)}`)}
            className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
          >
            {copied === "link" ? t("panel.pageLinkCopied") : t("panel.copyPageLink")}
          </button>
        </div>
      </div>
    </aside>
  );
}
