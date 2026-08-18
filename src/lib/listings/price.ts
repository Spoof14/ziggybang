import { formatKrwFromManwon } from "./copy";
import { type SalesType } from "./types";

export type PriceFilter = {
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
};

const MAX_DEPOSIT_MANWON = 1_000_000;
const MAX_RENT_MANWON = 50_000;

function cleanBound(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.min(max, Math.round(value));
}

export function normalizePriceFilter(input: {
  minDeposit?: unknown;
  maxDeposit?: unknown;
  minRent?: unknown;
  maxRent?: unknown;
}): PriceFilter {
  let minDeposit = cleanBound(input.minDeposit, MAX_DEPOSIT_MANWON);
  let maxDeposit = cleanBound(input.maxDeposit, MAX_DEPOSIT_MANWON);
  let minRent = cleanBound(input.minRent, MAX_RENT_MANWON);
  let maxRent = cleanBound(input.maxRent, MAX_RENT_MANWON);
  if (minDeposit != null && maxDeposit != null && minDeposit > maxDeposit) {
    [minDeposit, maxDeposit] = [maxDeposit, minDeposit];
  }
  if (minRent != null && maxRent != null && minRent > maxRent) {
    [minRent, maxRent] = [maxRent, minRent];
  }
  return {
    ...(minDeposit != null ? { minDeposit } : {}),
    ...(maxDeposit != null ? { maxDeposit } : {}),
    ...(minRent != null ? { minRent } : {}),
    ...(maxRent != null ? { maxRent } : {}),
  };
}

export function isEmptyPriceFilter(filter: PriceFilter): boolean {
  const next = normalizePriceFilter(filter);
  return (
    next.minDeposit == null &&
    next.maxDeposit == null &&
    next.minRent == null &&
    next.maxRent == null
  );
}

export function hasDepositBound(filter: PriceFilter): boolean {
  const next = normalizePriceFilter(filter);
  return next.minDeposit != null || next.maxDeposit != null;
}

export function hasRentBound(filter: PriceFilter): boolean {
  const next = normalizePriceFilter(filter);
  return next.minRent != null || next.maxRent != null;
}

export function listingMatchesPrice(
  listing: {
    deposit?: number;
    rent?: number;
    price?: number;
    salesType?: SalesType;
  },
  filter: PriceFilter,
  requirePrice: boolean,
): boolean {
  const next = normalizePriceFilter(filter);
  if (isEmptyPriceFilter(next)) return true;
  const deposit =
    listing.deposit ?? (listing.salesType === "sale" ? listing.price : undefined);
  const rent = listing.rent;

  if (hasDepositBound(next)) {
    if (deposit == null || !Number.isFinite(deposit)) return !requirePrice;
    if (next.minDeposit != null && deposit < next.minDeposit) return false;
    if (next.maxDeposit != null && deposit > next.maxDeposit) return false;
  }
  if (hasRentBound(next)) {
    if (rent == null || !Number.isFinite(rent)) return !requirePrice;
    if (next.minRent != null && rent < next.minRent) return false;
    if (next.maxRent != null && rent > next.maxRent) return false;
  }
  return true;
}

export function manwonToKrw(manwon: number): number {
  return Math.round(manwon * 10_000);
}

export function formatWonInput(manwon?: number): string {
  if (manwon == null || !Number.isFinite(manwon)) return "";
  return manwonToKrw(manwon).toLocaleString("en-US");
}

export function parseWonToManwon(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/₩/g, "").replace(/,/g, "").replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  const million = trimmed.match(/^(\d+(?:\.\d+)?)\s*(m|mil|million)$/i);
  if (million) {
    const krw = Number(million[1]) * 1_000_000;
    if (!Number.isFinite(krw) || krw < 0) return undefined;
    return Math.max(1, Math.round(krw / 10_000));
  }
  const value = Number(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(value) || value < 0) return undefined;
  const manwon = Math.round(value / 10_000);
  if (value > 0 && manwon <= 0) return undefined;
  return manwon;
}

function boundLabel(min?: number, max?: number): string | null {
  const minLabel = min != null ? formatKrwFromManwon(min) : null;
  const maxLabel = max != null ? formatKrwFromManwon(max) : null;
  if (minLabel && maxLabel) return `${minLabel}–${maxLabel.replace("₩", "")}`;
  if (maxLabel) return `≤ ${maxLabel}`;
  if (minLabel) return `≥ ${minLabel}`;
  return null;
}

export function describePriceFilter(filter: PriceFilter): string | null {
  const next = normalizePriceFilter(filter);
  if (isEmptyPriceFilter(next)) return null;
  const parts: string[] = [];
  const deposit = boundLabel(next.minDeposit, next.maxDeposit);
  const rent = boundLabel(next.minRent, next.maxRent);
  if (deposit) parts.push(`Deposit ${deposit}`);
  if (rent) parts.push(`Monthly ${rent}`);
  return parts.join(" · ") || null;
}
