import { formatKrwFromManwon } from "./copy";
import { type MapListing, type PropertyType, type SalesType } from "./types";

export type AgencyFeeEstimate = {
  feeManwon: number;
  feeWithVatManwon: number;
  ratePct: number;
  kind: "housing-lease" | "housing-sale" | "officetel";
  feeLabel: string;
  vatLabel: string;
  hint: string;
};

const MANWON = 10_000;

function leaseRate(dealKrw: number): { rate: number; capKrw?: number } {
  if (dealKrw < 50_000_000) return { rate: 0.005, capKrw: 200_000 };
  if (dealKrw < 100_000_000) return { rate: 0.004, capKrw: 300_000 };
  if (dealKrw < 300_000_000) return { rate: 0.003 };
  if (dealKrw < 600_000_000) return { rate: 0.004 };
  if (dealKrw < 1_200_000_000) return { rate: 0.005 };
  return { rate: 0.006 };
}

function saleRate(dealKrw: number): { rate: number; capKrw?: number } {
  if (dealKrw < 50_000_000) return { rate: 0.006, capKrw: 250_000 };
  if (dealKrw < 200_000_000) return { rate: 0.005, capKrw: 800_000 };
  if (dealKrw < 900_000_000) return { rate: 0.004 };
  if (dealKrw < 1_200_000_000) return { rate: 0.005 };
  if (dealKrw < 1_500_000_000) return { rate: 0.006 };
  return { rate: 0.007 };
}

function applyRate(dealKrw: number, rate: number, capKrw?: number): number {
  const raw = dealKrw * rate;
  return capKrw != null ? Math.min(raw, capKrw) : raw;
}

/** 월세 거래가액 = 보증금 + (월세×100), or ×70 when that exceeds the deposit. */
export function leaseDealKrw(depositManwon: number, rentManwon: number): number {
  const deposit = depositManwon * MANWON;
  const rent = rentManwon * MANWON;
  return rent * 100 > deposit ? deposit + rent * 70 : deposit + rent * 100;
}

export function estimateAgencyFee(listing: {
  salesType?: SalesType;
  propertyType?: PropertyType;
  deposit?: number;
  rent?: number;
  price?: number;
}): AgencyFeeEstimate | null {
  const officetel = listing.propertyType === "officetel";
  if (listing.salesType === "sale") {
    if (listing.price == null || !Number.isFinite(listing.price) || listing.price <= 0) {
      return null;
    }
    const dealKrw = listing.price * MANWON;
    const { rate, capKrw } = officetel
      ? { rate: 0.005, capKrw: undefined }
      : saleRate(dealKrw);
    return toEstimate(applyRate(dealKrw, rate, capKrw), rate, officetel ? "officetel" : "housing-sale");
  }

  const deposit = listing.deposit ?? 0;
  const rent = listing.rent ?? 0;
  if (listing.salesType === "wolse") {
    if (!Number.isFinite(deposit) || !Number.isFinite(rent) || rent <= 0) return null;
    const dealKrw = leaseDealKrw(deposit, rent);
    const { rate, capKrw } = officetel
      ? { rate: 0.005, capKrw: undefined }
      : leaseRate(dealKrw);
    return toEstimate(applyRate(dealKrw, rate, capKrw), rate, officetel ? "officetel" : "housing-lease");
  }

  if (listing.salesType === "jeonse" || (listing.rent == null && listing.deposit != null)) {
    if (!Number.isFinite(deposit) || deposit <= 0) return null;
    const dealKrw = deposit * MANWON;
    const { rate, capKrw } = officetel
      ? { rate: 0.005, capKrw: undefined }
      : leaseRate(dealKrw);
    return toEstimate(applyRate(dealKrw, rate, capKrw), rate, officetel ? "officetel" : "housing-lease");
  }
  return null;
}

export function agencyFeeCopy(listing: MapListing): AgencyFeeEstimate | null {
  return estimateAgencyFee(listing);
}

function toEstimate(
  feeKrw: number,
  rate: number,
  kind: AgencyFeeEstimate["kind"],
): AgencyFeeEstimate {
  const withVat = feeKrw * 1.1;
  const feeManwon = feeKrw / MANWON;
  const feeWithVatManwon = withVat / MANWON;
  const feeLabel = formatKrwFromManwon(feeManwon) ?? "";
  const vatLabel = formatKrwFromManwon(feeWithVatManwon) ?? "";
  const hint =
    kind === "officetel"
      ? "Officetel fees are negotiated (often 0.3–0.9%). This is a 0.5% midpoint, plus 10% VAT. Who pays is up to you and the agent; tenants often cover it."
      : "Legal cap for housing, plus 10% VAT. Who pays is negotiable; tenants often cover the full fee.";
  return {
    feeManwon,
    feeWithVatManwon,
    ratePct: Math.round(rate * 1000) / 10,
    kind,
    feeLabel,
    vatLabel,
    hint,
  };
}
