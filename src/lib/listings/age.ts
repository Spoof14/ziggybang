export const ageFilters = ["week", "month"] as const;
export type AgeFilter = (typeof ageFilters)[number];

export const ageFilterLabel: Record<AgeFilter, string> = {
  week: "This week",
  month: "This month",
};

export type ListingAgeTone = "fresh" | "recent" | "stale";

export const ageToneClass: Record<ListingAgeTone, string> = {
  fresh: "bg-emerald-400",
  recent: "bg-amber-300",
  stale: "bg-rose-500",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

const WEEK =
  /\b(this week|past week|last 7 days|newly listed|new listings?|listed this week|posted this week|fresh listings?|이번\s*주)\b/i;
const MONTH =
  /\b(this month|past month|last 30 days|recent listings?|listed recently|recently listed|listed this month|이번\s*달)\b/i;

export function parseAgeFilter(text: string): {
  ageFilter?: AgeFilter;
  rest: string;
} {
  let rest = text;
  let ageFilter: AgeFilter | undefined;
  if (WEEK.test(rest)) {
    ageFilter = "week";
    rest = rest.replace(new RegExp(WEEK.source, "gi"), " ");
  }
  if (MONTH.test(rest)) {
    ageFilter ??= "month";
    rest = rest.replace(new RegExp(MONTH.source, "gi"), " ");
  }
  return { ageFilter, rest: rest.replace(/\s+/g, " ").trim() };
}

export function parseListingDate(value?: string): Date | null {
  if (!value) return null;
  const iso = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isFinite(iso)) return new Date(iso);
  const compact = value.match(/(\d{4})[.\-/]?(\d{2})[.\-/]?(\d{2})/);
  if (!compact) return null;
  const year = Number(compact[1]);
  const month = Number(compact[2]);
  const day = Number(compact[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function listingAgeMs(updatedAt?: string, now = Date.now()): number | undefined {
  const date = parseListingDate(updatedAt);
  if (!date) return undefined;
  return Math.max(0, now - date.getTime());
}

export function listingAgeTone(
  updatedAt?: string,
  now = Date.now(),
): ListingAgeTone | undefined {
  const ageMs = listingAgeMs(updatedAt, now);
  if (ageMs == null) return undefined;
  if (ageMs < WEEK_MS) return "fresh";
  if (ageMs < MONTH_MS) return "recent";
  return "stale";
}

export function listingMatchesAge(
  updatedAt: string | undefined,
  filter: AgeFilter | undefined,
  requireDetails: boolean,
  now = Date.now(),
): boolean {
  if (!filter) return true;
  const ageMs = listingAgeMs(updatedAt, now);
  if (ageMs == null) return !requireDetails;
  if (filter === "week") return ageMs <= WEEK_MS;
  return ageMs <= MONTH_MS;
}

export function formatRelativeListed(value?: string, now = Date.now()): string | null {
  const ageMs = listingAgeMs(value, now);
  if (ageMs == null) return null;
  const days = Math.floor(ageMs / DAY_MS);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}
