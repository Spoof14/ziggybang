export const M2_PER_PYEONG = 3.3058;

export function toPyeong(areaM2: number): number {
  return areaM2 / M2_PER_PYEONG;
}

export function pyeongToM2(pyeong: number): number {
  return pyeong * M2_PER_PYEONG;
}

export const areaBuckets = [
  {
    id: "xs",
    label: "<20 m² · <6 py",
    hint: "Under 20 m² / 6 pyeong",
    minM2: 0,
    maxM2: 20,
  },
  {
    id: "s",
    label: "20–33 m² · 6–10 py",
    hint: "20–33 m² / 6–10 pyeong",
    minM2: 20,
    maxM2: 33,
  },
  {
    id: "m",
    label: "33–50 m² · 10–15 py",
    hint: "33–50 m² / 10–15 pyeong",
    minM2: 33,
    maxM2: 50,
  },
  {
    id: "l",
    label: "50+ m² · 15+ py",
    hint: "50+ m² / 15+ pyeong",
    minM2: 50,
    maxM2: undefined,
  },
] as const;

export type AreaBucketId = (typeof areaBuckets)[number]["id"];

export function isAllAreaBuckets(selected: AreaBucketId[]): boolean {
  return selected.length === 0 || selected.length === areaBuckets.length;
}

export function listingMatchesArea(
  areaM2: number | undefined,
  selected: AreaBucketId[],
  requireArea: boolean,
): boolean {
  if (isAllAreaBuckets(selected)) return true;
  if (areaM2 == null || !Number.isFinite(areaM2)) return !requireArea;
  return selected.some((id) => {
    const bucket = areaBuckets.find((item) => item.id === id);
    if (!bucket) return false;
    if (areaM2 < bucket.minM2) return false;
    if (bucket.maxM2 != null && areaM2 >= bucket.maxM2) return false;
    return true;
  });
}
