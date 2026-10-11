"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { formatCount } from "~/lib/i18n";
import { useI18n } from "~/lib/i18n/react";
import {
  formatArea,
  formatFloor,
  formatKrwFromManwon,
  formatRoomType,
  propertyTypeText,
  salesTypeHintText,
  salesTypeText,
  sourceText,
} from "~/lib/listings/copy";
import { glossText } from "~/lib/listings/glossary";
import {
  formatApproveYear,
  formatKoreanPhone,
  formatMoveIn,
  telHref,
  translateAmenity,
  translateDirection,
  translateOption,
  translateParking,
  translatePoi,
  translateResidence,
  translateSubwayLine,
  translateUtility,
} from "~/lib/listings/detail-copy";
import { agencyFeeCopy } from "~/lib/listings/agency-fee";
import {
  englishAddressLine,
  englishCardTitle,
  koreanAddressForTaxi,
} from "~/lib/listings/english";
import { detectForeignerOk } from "~/lib/listings/foreigner";
import { listingGalleryUrls } from "~/lib/listings/photo";
import {
  listingMapHref,
  mergeListingDetail,
  readStashedListing,
  type ListingPath,
} from "~/lib/listings/path";
import {
  isSavedHome,
  loadSavedHomes,
  saveSavedHomes,
  toggleSavedHome,
} from "~/lib/listings/saved";
import { type ListingDetail, type MapListing } from "~/lib/listings/types";
import { BackToMap } from "./BackToMap";
import { ForeignerBadge } from "./ForeignerBadge";
import { LandlordNotes } from "./LandlordNotes";
import { ListingAgeLine } from "./ListingAgeLine";
import { ListingGallery } from "./ListingGallery";
import { ListingLocationCard } from "./ListingLocationCard";
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

export function ListingDetailView({
  path,
  initial,
}: {
  path: ListingPath;
  initial: ListingDetail | null;
}) {
  const { lang, t } = useI18n();
  const [stashed, setStashed] = useState<MapListing | null>(null);
  const [savedHomes, setSavedHomes] = useState<MapListing[]>([]);
  const [copied, setCopied] = useState<"address" | "page" | null>(null);

  const detailQuery = api.listings.getDetail.useQuery(
    {
      source: path.source,
      sourceId: path.sourceId,
      propertyType: path.propertyType,
    },
    {
      retry: false,
      ...(initial ? { initialData: initial } : {}),
    },
  );

  useEffect(() => {
    setStashed(readStashedListing(path));
    setSavedHomes(loadSavedHomes());
  }, [path]);

  const listing = useMemo(
    () => mergeListingDetail(detailQuery.data ?? initial, stashed),
    [detailQuery.data, initial, stashed],
  );

  async function copy(kind: "address" | "page", value: string) {
    const ok = await copyText(value, t("panel.copyPrompt"));
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  if (!listing) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-slate-300">
        <h1 className="text-xl font-semibold text-white">{t("page.notFound")}</h1>
        <p className="mt-2 text-sm">
          {t("page.notFoundBody")}
        </p>
        <BackToMap
          href="/"
          className="mt-6 inline-flex rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
        />
      </main>
    );
  }

  const photos = listingGalleryUrls(listing);
  const deposit = formatKrwFromManwon(listing.deposit, lang);
  const rent = formatKrwFromManwon(listing.rent, lang);
  const salePrice = formatKrwFromManwon(listing.price, lang);
  const manageCost = formatKrwFromManwon(listing.manageCost, lang);
  const firstMonth =
    listing.salesType === "wolse"
      ? formatKrwFromManwon(
          (listing.deposit ?? 0) + (listing.rent ?? 0) + (listing.manageCost ?? 0),
          lang,
        )
      : null;
  const area = formatArea(listing.areaM2, lang);
  const floor = formatFloor(listing.floor, lang);
  const roomType = formatRoomType(listing.roomType, lang);
  const where = englishAddressLine(listing, lang);
  const taxiAddress = koreanAddressForTaxi(listing.address);
  const englishTitle = englishCardTitle(listing, lang);
  const parking = translateParking(listing.parking, lang);
  const direction = translateDirection(listing.direction, lang);
  const residence = translateResidence(listing.residenceType, lang);
  const moveIn = formatMoveIn(listing.moveIn, lang);
  const built = formatApproveYear(listing.approveDate, lang);
  const listed = listing.updatedAt;
  const mapHref = listingMapHref(listing);
  const saved = isSavedHome(savedHomes, listing.id);
  const officePhone = formatKoreanPhone(listing.agent?.phone);
  const mobilePhone = formatKoreanPhone(listing.agent?.mobile);
  const foreignerOk =
    listing.foreignerOk ?? detectForeignerOk(listing.title, listing.description);
  const agencyFee = agencyFeeCopy(listing, lang);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-300">
              Ziggybang
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-lg">
              {englishTitle.trim() ? englishTitle : (listing.title ?? t("app.listingTitle"))}
            </h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <BackToMap
              href={mapHref ?? "/"}
              className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/20"
            />
            <button
              type="button"
              onClick={() => {
                const next = toggleSavedHome(savedHomes, listing);
                saveSavedHomes(next);
                setSavedHomes(next);
              }}
              className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] hover:bg-white/20"
            >
              {saved ? t("page.saved") : t("page.save")}
            </button>
            <ListingShareButton
              listing={listing}
              title={englishTitle}
              labeled
              className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/20"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.9fr)]">
        <section className="min-w-0 space-y-4">
          <ListingGallery
            urls={photos}
            alt={listing.title ?? englishTitle}
            layout="page"
          />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {sourceText(lang, listing.source)} · {propertyTypeText(lang, listing.propertyType)}
              {listing.salesType ? ` · ${salesTypeText(lang, listing.salesType)}` : ""}
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-snug">
              {englishTitle.trim() ? englishTitle : listing.title}
            </h2>
            <ForeignerBadge ok={foreignerOk} className="mt-2 inline-flex" />
            {listing.title && listing.title !== englishTitle ? (
              <p lang="ko" className="mt-1 text-sm text-slate-400">
                {lang === "en" ? glossText(listing.title, lang) : listing.title}
              </p>
            ) : null}
            {listing.salesType ? (
              <p className="mt-1 text-sm text-slate-400">
                {salesTypeHintText(lang, listing.salesType)}
              </p>
            ) : null}
            <ListingPrice
              listing={listing}
              className="mt-3 text-xl font-semibold leading-snug text-sky-300"
            />
          </div>

          {listing.description ? (
            <LandlordNotes text={listing.description} source={listing.source} />
          ) : null}

          {listing.options?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-white">{t("page.included")}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {listing.options.map((option) => (
                  <span
                    key={option}
                    className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200"
                  >
                    {translateOption(option, lang)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {listing.amenities?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-white">{t("page.neighborhood")}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {listing.amenities.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-sky-400/15 px-2.5 py-1 text-xs text-sky-200"
                  >
                    {translateAmenity(item, lang)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {listing.nearby?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-white">{t("page.walk")}</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {listing.nearby.map((item) => (
                  <li key={`${item.type}-${item.meters}`}>
                    {translatePoi(item.type, lang)}
                    {item.walkMinutes
                      ? ` · ${t("page.walkMin", { n: item.walkMinutes })}`
                      : ` · ${t("page.walkMeters", { n: formatCount(item.meters, lang) })}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <h3 className="text-sm font-semibold text-white">{t("page.glance")}</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {listing.salesType === "wolse" && deposit ? (
                <Fact label={t("page.deposit")} value={deposit} />
              ) : null}
              {listing.salesType === "wolse" && rent ? (
                <Fact label={t("page.monthlyRent")} value={t("panel.perMonth", { amount: rent })} />
              ) : null}
              {listing.salesType === "jeonse" && deposit ? (
                <Fact label={t("page.jeonseDeposit")} value={deposit} wide />
              ) : null}
              {listing.salesType === "sale" && salePrice ? (
                <Fact label={t("page.salePrice")} value={salePrice} wide />
              ) : null}
              {manageCost ? (
                <Fact label={t("panel.maintenance")} value={t("panel.perMonth", { amount: manageCost })} />
              ) : null}
              {firstMonth ? (
                <Fact label={t("page.moveInCash")} value={firstMonth} wide />
              ) : null}
              {area ? <Fact label={t("panel.exclusiveArea")} value={area} /> : null}
              {floor ? <Fact label={t("panel.floor")} value={floor} /> : null}
              {roomType ? <Fact label={t("panel.layout")} value={roomType} /> : null}
              {listing.bathrooms ? (
                <Fact
                  label={t("page.bathrooms")}
                  value={String(listing.bathrooms)}
                />
              ) : null}
              {parking ? <Fact label={t("page.parking")} value={parking} /> : null}
              {listing.elevator != null ? (
                <Fact
                  label={t("page.elevator")}
                  value={listing.elevator ? t("page.yes") : t("page.no")}
                />
              ) : null}
              {direction ? <Fact label={t("page.faces")} value={direction} /> : null}
              {residence ? <Fact label={t("page.building")} value={residence} /> : null}
              {moveIn ? <Fact label={t("page.moveIn")} value={moveIn} wide /> : null}
              {built ? <Fact label={t("page.age")} value={built} /> : null}
              {listed ? (
                <div className="col-span-2">
                  <dt className="text-slate-400">{t("panel.listed")}</dt>
                  <dd className="font-medium text-slate-100">
                    <ListingAgeLine updatedAt={listing.updatedAt} />
                  </dd>
                </div>
              ) : null}
              {listing.count && listing.count > 1 ? (
                <Fact
                  label={t("page.complexHomes")}
                  value={formatCount(listing.count, lang)}
                  wide
                />
              ) : null}
              {where ? <Fact label={t("panel.area")} value={where} wide /> : null}
              {taxiAddress ? (
                <div className="col-span-2">
                  <dt className="text-slate-400">{t("panel.taxi")}</dt>
                  <dd className="mt-0.5 flex items-start justify-between gap-2">
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
            </dl>
            {(listing.manageIncludes?.length ?? 0) +
            (listing.manageExcludes?.length ?? 0) >
            0 ? (
              <div className="mt-3 space-y-1 text-xs text-slate-400">
                {listing.manageIncludes?.length ? (
                  <p>
                    {t("page.mgmtIncludes", {
                      items: listing.manageIncludes.map((item) => translateUtility(item, lang)).join(", "),
                    })}
                  </p>
                ) : null}
                {listing.manageExcludes?.length ? (
                  <p>
                    {t("page.mgmtExcludes", {
                      items: listing.manageExcludes.map((item) => translateUtility(item, lang)).join(", "),
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {listing.salesType === "wolse" && firstMonth ? (
              <p className="mt-3 text-[11px] text-slate-500">
                {t("page.moveInCashNote")}
              </p>
            ) : null}
          </section>

          {agencyFee ? (
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-white">
                {t("page.agencyTitle")}
              </h3>
              <p className="mt-2 text-lg font-semibold text-sky-300">
                {t("panel.agencyIncl", { amount: agencyFee.vatLabel })}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {t("page.agencyCap", {
                  fee: agencyFee.feeLabel,
                  pct: agencyFee.ratePct,
                  officetel: agencyFee.kind === "officetel" ? t("page.agencyOfficetel") : "",
                })}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {agencyFee.hint}
              </p>
            </section>
          ) : null}

          <ListingLocationCard
            listing={listing}
            title={englishTitle.trim() ? englishTitle : t("page.homeFallback")}
          />

          {listing.subways?.length ? (
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-white">{t("page.nearbySubway")}</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {listing.subways.map((station) => (
                  <li key={station.name}>
                    {station.name}
                    {station.line
                      ? ` · ${translateSubwayLine(station.line, lang)}`
                      : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {listing.agent?.name ?? listing.agent?.office ? (
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-white">{t("page.agent")}</h3>
              <p className="mt-2 text-sm">
                {listing.agent.office ?? listing.agent.name}
              </p>
              {listing.agent.name && listing.agent.office ? (
                <p className="text-xs text-slate-400">{listing.agent.name}</p>
              ) : null}
              {listing.agent.address ? (
                <p className="mt-1 text-xs text-slate-400">
                  {listing.agent.address}
                </p>
              ) : null}
              {officePhone ? (
                <p className="mt-2 text-sm">
                  {t("page.office")}{" "}
                  {telHref(listing.agent.phone) ? (
                    <a
                      href={telHref(listing.agent.phone)!}
                      className="text-sky-300 hover:text-sky-200"
                    >
                      {officePhone}
                    </a>
                  ) : (
                    officePhone
                  )}
                </p>
              ) : null}
              {mobilePhone && mobilePhone !== officePhone ? (
                <p className="text-sm">
                  {t("page.mobile")}{" "}
                  {telHref(listing.agent.mobile) ? (
                    <a
                      href={telHref(listing.agent.mobile)!}
                      className="text-sky-300 hover:text-sky-200"
                    >
                      {mobilePhone}
                    </a>
                  ) : (
                    mobilePhone
                  )}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
            >
              {t("card.openOn", { source: sourceText(lang, listing.source) })}
            </a>
            <button
              type="button"
              onClick={() => void copy("page", window.location.href)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/20"
            >
              {copied === "page" ? t("panel.pageLinkCopied") : t("page.copyThisPage")}
            </button>
            {detailQuery.isError ? (
              <p className="text-[11px] text-amber-300">
                {t("page.liveFailed")}
              </p>
            ) : null}
          </section>
        </aside>
      </main>
    </div>
  );
}

function Fact({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-100">{value}</dd>
    </div>
  );
}
