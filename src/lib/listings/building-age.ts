import { DEFAULT_LANG, tn, type Lang } from "~/lib/i18n";

/** Strictest filter: only buildings this young or newer. */
export const MAX_BUILDING_AGE_MIN = 5;
/** At or above this value the filter is off ("any age"). */
export const MAX_BUILDING_AGE_ANY = 40;

export type BuildingAgeFilter = {
  maxBuildingAge?: number;
};

export function builtYearMax(now = new Date()): number {
  return now.getUTCFullYear();
}

export function normalizeBuildingAgeFilter(input: {
  maxBuildingAge?: unknown;
}): BuildingAgeFilter {
  if (typeof input.maxBuildingAge !== "number" || !Number.isFinite(input.maxBuildingAge)) {
    return {};
  }
  const years = Math.round(input.maxBuildingAge);
  if (years < MAX_BUILDING_AGE_MIN || years >= MAX_BUILDING_AGE_ANY) return {};
  return { maxBuildingAge: years };
}

export function isEmptyBuildingAgeFilter(filter: BuildingAgeFilter): boolean {
  return filter.maxBuildingAge == null;
}

export function parseBuiltYear(value?: string): number | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  const year = Number(digits.slice(0, 4));
  if (year < 1900 || year > 2100) return undefined;
  return year;
}

export function buildingAgeYears(
  approveDate: string | undefined,
  now = new Date(),
): number | undefined {
  const year = parseBuiltYear(approveDate);
  if (year == null) return undefined;
  return builtYearMax(now) - year;
}

export function listingMatchesBuildingAge(
  approveDate: string | undefined,
  maxBuildingAge: number | undefined,
  requireDetails: boolean,
  now = new Date(),
): boolean {
  if (!maxBuildingAge) return true;
  const age = buildingAgeYears(approveDate, now);
  if (age == null) return !requireDetails;
  return age <= maxBuildingAge;
}

export function describeBuildingAgeFilter(
  maxBuildingAge?: number,
  lang: Lang = DEFAULT_LANG,
): string | null {
  if (!maxBuildingAge) return null;
  return tn(lang, "building.upTo", maxBuildingAge);
}

export function parseMaxBuildingAge(text: string, now = new Date()): number | undefined {
  const builtAfter = /\b(?:built|constructed|approved)\s+(?:after|since|from)\s+((?:19|20)\d{2})\b/i.exec(text);
  if (builtAfter?.[1]) {
    const year = Number(builtAfter[1]);
    if (Number.isFinite(year)) {
      return normalizeBuildingAgeFilter({
        maxBuildingAge: Math.max(MAX_BUILDING_AGE_MIN, builtYearMax(now) - year),
      }).maxBuildingAge;
    }
  }
  const korean = /(\d{1,2})\s*년\s*(?:이내|이하|미만|된)/.exec(text);
  const newer =
    (/(?:newer than|younger than|less than|fewer than|under|within|max(?:imum)?|up to|<=?)\s*(\d{1,2})\s*(?:years?|yrs?|y)\b/i.exec(text)) ??
    (/(\d{1,2})\s*(?:years?|yrs?)\s*(?:old\s*)?(?:or\s+)?(?:newer|younger|or less)\b/i.exec(text));
  const early = korean?.[1] ?? newer?.[1];
  if (early) {
    const years = Number(early);
    if (Number.isFinite(years) && years > 0) {
      return normalizeBuildingAgeFilter({
        maxBuildingAge: Math.max(MAX_BUILDING_AGE_MIN, years),
      }).maxBuildingAge;
    }
  }
  const match = (/(?:(?:less than|under|up to|no more than|max(?:imum)?|within|younger than|no older than)\s+)?(\d{1,2})\s*(?:years?|yrs?)\s*old\b/i.exec(text)) ?? (/(?:less than|under|up to|no more than|max(?:imum)?|within)\s+(\d{1,2})\s*(?:years?|yrs?)\b/i.exec(text));
  const years = Number(match?.[1]);
  if (!Number.isFinite(years) || years <= 0) return undefined;
  return normalizeBuildingAgeFilter({
    maxBuildingAge: Math.max(MAX_BUILDING_AGE_MIN, years),
  }).maxBuildingAge;
}
