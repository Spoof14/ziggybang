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

export function describeBuildingAgeFilter(maxBuildingAge?: number): string | null {
  if (!maxBuildingAge) return null;
  if (maxBuildingAge === 1) return "Up to 1 year old";
  return `Up to ${maxBuildingAge} years old`;
}
