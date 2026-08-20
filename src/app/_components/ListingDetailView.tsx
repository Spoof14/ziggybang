"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import {
  formatApproveYear,
  formatKoreanPhone,
  formatListedAt,
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
import {
  hasListingCoords,
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
import { ForeignerBadge } from "./ForeignerBadge";
import { LandlordNotes } from "./LandlordNotes";
import { ListingGallery } from "./ListingGallery";

const MiniMap = dynamic(
  () => import("./ListingMiniMap").then((mod) => mod.ListingMiniMap),
  { ssr: false },
);

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt("Copy this", value);
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
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  if (!listing) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-slate-300">
        <h1 className="text-xl font-semibold text-white">Listing not found</h1>
        <p className="mt-2 text-sm">
          This home may have been taken down. Back to the map still works.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
        >
          Back to map
        </Link>
      </main>
    );
  }

  const photos = [
    ...new Set(
      [listing.thumbnail, ...(listing.photos ?? [])].filter(
        (url): url is string => Boolean(url),
      ),
    ),
  ];
  const price = formatPrice(listing);
  const deposit = formatKrwFromManwon(listing.deposit);
  const rent = formatKrwFromManwon(listing.rent);
  const salePrice = formatKrwFromManwon(listing.price);
  const manageCost = formatKrwFromManwon(listing.manageCost);
  const firstMonth =
    listing.salesType === "wolse"
      ? formatKrwFromManwon(
          (listing.deposit ?? 0) + (listing.rent ?? 0) + (listing.manageCost ?? 0),
        )
      : null;
  const area = formatArea(listing.areaM2);
  const floor = formatFloor(listing.floor);
  const roomType = formatRoomType(listing.roomType);
  const where = englishAddressLine(listing);
  const taxiAddress = koreanAddressForTaxi(listing.address);
  const englishTitle = englishCardTitle(listing);
  const parking = translateParking(listing.parking);
  const direction = translateDirection(listing.direction);
  const residence = translateResidence(listing.residenceType);
  const moveIn = formatMoveIn(listing.moveIn);
  const built = formatApproveYear(listing.approveDate);
  const listed = formatListedAt(listing.updatedAt);
  const mapHref = listingMapHref(listing);
  const saved = isSavedHome(savedHomes, listing.id);
  const officePhone = formatKoreanPhone(listing.agent?.phone);
  const mobilePhone = formatKoreanPhone(listing.agent?.mobile);
  const googleMaps = hasListingCoords(listing)
    ? `https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`
    : taxiAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(taxiAddress)}`
      : null;
  const kakaoMaps = hasListingCoords(listing)
    ? `https://map.kakao.com/link/map/${encodeURIComponent(englishTitle.trim() ? englishTitle : "Home")},${listing.lat},${listing.lng}`
    : null;
  const naverMaps = hasListingCoords(listing)
    ? `https://map.naver.com/p/search/${listing.lat},${listing.lng}`
    : taxiAddress
      ? `https://map.naver.com/p/search/${encodeURIComponent(taxiAddress)}`
      : null;
  const foreignerOk =
    listing.foreignerOk ?? detectForeignerOk(listing.title, listing.description);
  const agencyFee = agencyFeeCopy(listing);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-300">
              Ziggybang
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-lg">
              {englishTitle.trim() ? englishTitle : (listing.title ?? "Listing")}
            </h1>
          </div>
          <div className="flex shrink-0 gap-2">
            {mapHref ? (
              <Link
                href={mapHref}
                className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/20"
              >
                View on map
              </Link>
            ) : (
              <Link
                href="/"
                className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/20"
              >
                Back to map
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                const next = toggleSavedHome(savedHomes, listing);
                saveSavedHomes(next);
                setSavedHomes(next);
              }}
              className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] hover:bg-white/20"
            >
              {saved ? "Saved ♥" : "Save ♡"}
            </button>
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
              {sourceLabel[listing.source]} · {propertyTypeLabel[listing.propertyType]}
              {listing.salesType ? ` · ${salesTypeLabel[listing.salesType]}` : ""}
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-snug">
              {englishTitle.trim() ? englishTitle : listing.title}
            </h2>
            <ForeignerBadge ok={foreignerOk} className="mt-2 inline-flex" />
            {listing.title && listing.title !== englishTitle ? (
              <p className="mt-1 text-sm text-slate-400">{listing.title}</p>
            ) : null}
            {listing.salesType ? (
              <p className="mt-1 text-sm text-slate-400">
                {salesTypeHint[listing.salesType]}
              </p>
            ) : null}
            {price ? (
              <p className="mt-3 text-xl font-semibold text-sky-300">{price}</p>
            ) : null}
          </div>

          {listing.description ? (
            <LandlordNotes text={listing.description} source={listing.source} />
          ) : null}

          {listing.options?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-white">Included furniture</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {listing.options.map((option) => (
                  <span
                    key={option}
                    className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200"
                  >
                    {translateOption(option)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {listing.amenities?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-white">Neighborhood</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {listing.amenities.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-sky-400/15 px-2.5 py-1 text-xs text-sky-200"
                  >
                    {translateAmenity(item)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {listing.nearby?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-white">Walk from the door</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {listing.nearby.map((item) => (
                  <li key={`${item.type}-${item.meters}`}>
                    {translatePoi(item.type)}
                    {item.walkMinutes
                      ? ` · ${item.walkMinutes} min walk`
                      : ` · ${item.meters.toLocaleString("en-US")} m`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <h3 className="text-sm font-semibold text-white">At a glance</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {listing.salesType === "wolse" && deposit ? (
                <Fact label="Deposit" value={deposit} />
              ) : null}
              {listing.salesType === "wolse" && rent ? (
                <Fact label="Monthly rent" value={`${rent} / month`} />
              ) : null}
              {listing.salesType === "jeonse" && deposit ? (
                <Fact label="Jeonse deposit" value={deposit} wide />
              ) : null}
              {listing.salesType === "sale" && salePrice ? (
                <Fact label="Sale price" value={salePrice} wide />
              ) : null}
              {manageCost ? (
                <Fact label="Maintenance" value={`${manageCost} / month`} />
              ) : null}
              {firstMonth ? (
                <Fact label="Move-in cash" value={firstMonth} wide />
              ) : null}
              {area ? <Fact label="Size" value={area} /> : null}
              {floor ? <Fact label="Floor" value={floor} /> : null}
              {roomType ? <Fact label="Layout" value={roomType} /> : null}
              {listing.bathrooms ? (
                <Fact
                  label="Bathrooms"
                  value={String(listing.bathrooms)}
                />
              ) : null}
              {parking ? <Fact label="Parking" value={parking} /> : null}
              {listing.elevator != null ? (
                <Fact
                  label="Elevator"
                  value={listing.elevator ? "Yes" : "No"}
                />
              ) : null}
              {direction ? <Fact label="Faces" value={direction} /> : null}
              {residence ? <Fact label="Building" value={residence} /> : null}
              {moveIn ? <Fact label="Move-in" value={moveIn} wide /> : null}
              {built ? <Fact label="Age" value={built} /> : null}
              {listed ? <Fact label="Updated" value={listed} /> : null}
              {listing.count && listing.count > 1 ? (
                <Fact
                  label="Homes in this complex"
                  value={listing.count.toLocaleString("en-US")}
                  wide
                />
              ) : null}
              {where ? <Fact label="Area" value={where} wide /> : null}
              {taxiAddress ? (
                <div className="col-span-2">
                  <dt className="text-slate-400">Korean address (for taxis)</dt>
                  <dd className="mt-0.5 flex items-start justify-between gap-2">
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
            </dl>
            {(listing.manageIncludes?.length ?? 0) +
            (listing.manageExcludes?.length ?? 0) >
            0 ? (
              <div className="mt-3 space-y-1 text-xs text-slate-400">
                {listing.manageIncludes?.length ? (
                  <p>
                    Maintenance includes{" "}
                    {listing.manageIncludes.map(translateUtility).join(", ")}.
                  </p>
                ) : null}
                {listing.manageExcludes?.length ? (
                  <p>
                    Not included:{" "}
                    {listing.manageExcludes.map(translateUtility).join(", ")}.
                  </p>
                ) : null}
              </div>
            ) : null}
            {listing.salesType === "wolse" && firstMonth ? (
              <p className="mt-3 text-[11px] text-slate-500">
                Move-in cash is deposit + first month + maintenance, before agency
                fees.
              </p>
            ) : null}
          </section>

          {agencyFee ? (
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-white">
                Agency fee (est.)
              </h3>
              <p className="mt-2 text-lg font-semibold text-sky-300">
                {agencyFee.vatLabel} incl. VAT
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Cap {agencyFee.feeLabel} at {agencyFee.ratePct}% of the deal
                {agencyFee.kind === "officetel" ? " (officetel midpoint)" : ""}.
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {agencyFee.hint}
              </p>
            </section>
          ) : null}

          {hasListingCoords(listing) ? (
            <section className="overflow-hidden rounded-2xl border border-white/10">
              <MiniMap lat={listing.lat} lng={listing.lng} />
              <div className="flex flex-wrap gap-2 p-3 text-[11px]">
                {googleMaps ? (
                  <a
                    href={googleMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/20"
                  >
                    Google Maps
                  </a>
                ) : null}
                {kakaoMaps ? (
                  <a
                    href={kakaoMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/20"
                  >
                    Kakao Map
                  </a>
                ) : null}
                {naverMaps ? (
                  <a
                    href={naverMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200 hover:bg-white/20"
                  >
                    Naver Map
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          {listing.subways?.length ? (
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-white">Nearby subway</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {listing.subways.map((station) => (
                  <li key={station.name}>
                    {station.name}
                    {station.line
                      ? ` · ${translateSubwayLine(station.line)}`
                      : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {listing.agent?.name ?? listing.agent?.office ? (
            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-white">Agent</h3>
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
                  Office{" "}
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
                  Mobile{" "}
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
              Open on {sourceLabel[listing.source]}
            </a>
            <button
              type="button"
              onClick={() => void copy("page", window.location.href)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/20"
            >
              {copied === "page" ? "Page link copied" : "Copy this page"}
            </button>
            {detailQuery.isError ? (
              <p className="text-[11px] text-amber-300">
                Live details did not load. Showing what we already had from the
                map.
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
