"use client";

import { api } from "~/trpc/react";
import {
  type MapListing,
  type PropertyType,
  type SalesType,
  type Source,
} from "~/lib/listings/types";

const sourceLabel: Record<Source, string> = {
  zigbang: "직방",
  naver: "네이버",
};

const typeLabel: Record<PropertyType, string> = {
  oneroom: "원룸",
  villa: "빌라",
  officetel: "오피스텔",
  apartment: "아파트",
};

const salesLabel: Record<SalesType, string> = {
  jeonse: "전세",
  wolse: "월세",
  sale: "매매",
};

function formatManwon(value?: number) {
  if (value == null) return null;
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const rest = value % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString()}만` : `${eok}억`;
  }
  return `${value.toLocaleString()}만`;
}

function priceText(listing: {
  salesType?: SalesType;
  deposit?: number;
  rent?: number;
  price?: number;
}) {
  if (listing.salesType === "sale" && listing.price != null) {
    return formatManwon(listing.price);
  }
  if (listing.salesType === "wolse" && listing.deposit != null) {
    return `${formatManwon(listing.deposit)} / ${formatManwon(listing.rent ?? 0)}`;
  }
  if (listing.deposit != null) {
    return formatManwon(listing.deposit);
  }
  return null;
}

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
  const price = priceText(detail);

  return (
    <aside className="pointer-events-auto absolute bottom-4 left-4 right-4 z-[500] max-h-[45vh] overflow-auto rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur md:bottom-6 md:left-auto md:right-6 md:w-[360px]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {sourceLabel[listing.source]} · {typeLabel[listing.propertyType]}
            {detail.salesType ? ` · ${salesLabel[detail.salesType]}` : ""}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">
            {detail.title ?? `${typeLabel[listing.propertyType]} ${listing.sourceId}`}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/20"
        >
          닫기
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
          <div>
            <dt className="text-slate-400">가격</dt>
            <dd className="font-medium">{price}</dd>
          </div>
        ) : null}
        {detail.areaM2 ? (
          <div>
            <dt className="text-slate-400">면적</dt>
            <dd>{detail.areaM2}㎡</dd>
          </div>
        ) : null}
        {detail.floor ? (
          <div>
            <dt className="text-slate-400">층</dt>
            <dd>{detail.floor}</dd>
          </div>
        ) : null}
        {detail.address ? (
          <div className="col-span-2">
            <dt className="text-slate-400">주소</dt>
            <dd>{detail.address}</dd>
          </div>
        ) : null}
        {listing.count && listing.count > 1 ? (
          <div>
            <dt className="text-slate-400">매물 수</dt>
            <dd>{listing.count}</dd>
          </div>
        ) : null}
      </dl>

      {detailQuery.isLoading ? (
        <p className="mt-3 text-sm text-slate-400">상세 정보를 불러오는 중…</p>
      ) : null}

      <a
        href={detail.url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
      >
        원문 보기
      </a>
    </aside>
  );
}
