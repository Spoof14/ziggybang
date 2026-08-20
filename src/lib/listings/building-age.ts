export const BUILT_YEAR_MIN = 1985;

export type BuiltYearFilter = {
  minBuiltYear?: number;
};

export function builtYearMax(now = new Date()): number {
  return now.getUTCFullYear();
}

export function normalizeBuiltYearFilter(input: {
  minBuiltYear?: unknown;
}): BuiltYearFilter {
  if (typeof input.minBuiltYear !== "number" || !Number.isFinite(input.minBuiltYear)) {
    return {};
  }
  const year = Math.round(input.minBuiltYear);
  const max = builtYearMax();
  if (year < BUILT_YEAR_MIN || year > max) return {};
  return { minBuiltYear: year };
}

export function isEmptyBuiltYearFilter(filter: BuiltYearFilter): boolean {
  return filter.minBuiltYear == null;
}

export function parseBuiltYear(value?: string): number | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  const year = Number(digits.slice(0, 4));
  if (year < 1900 || year > 2100) return undefined;
  return year;
}

export function listingMatchesBuiltYear(
  approveDate: string | undefined,
  minBuiltYear: number | undefined,
  requireDetails: boolean,
): boolean {
  if (!minBuiltYear) return true;
  const year = parseBuiltYear(approveDate);
  if (year == null) return !requireDetails;
  return year >= minBuiltYear;
}

export function describeBuiltYearFilter(minBuiltYear?: number): string | null {
  if (!minBuiltYear) return null;
  return `Built ${minBuiltYear} or newer`;
}
