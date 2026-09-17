export const M2_PER_PYEONG = 3.3058;

export function toPyeong(areaM2: number): number {
  return areaM2 / M2_PER_PYEONG;
}

export function pyeongToM2(pyeong: number): number {
  return pyeong * M2_PER_PYEONG;
}

const EXCLUSIVE_KEY = /전용|exclusive|real[_ ]?size/i;
const SHARED_KEY = /공급|계약|supply|supplied|contract|common|shared/i;
const PYEONG_KEY = /평|pyeong|\bpy\b/i;

function positiveArea(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * Floor area the tenant actually gets (전용면적), never 공급/계약면적.
 * Those larger figures include shared corridors, elevator shafts, etc.
 */
export function exclusiveAreaM2(
  fields?: Record<string, unknown> | null,
  preferred?: unknown,
): number | undefined {
  const hinted = positiveArea(preferred);
  if (hinted != null) return hinted;
  if (!fields) return undefined;

  const exclusiveM2: number[] = [];
  const exclusivePyeong: number[] = [];
  const otherM2: number[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    const n = positiveArea(raw);
    if (n == null || SHARED_KEY.test(key)) continue;
    const exclusive = EXCLUSIVE_KEY.test(key);
    const pyeong = PYEONG_KEY.test(key);
    if (exclusive && pyeong) exclusivePyeong.push(n);
    else if (exclusive) exclusiveM2.push(n);
    else if (!pyeong) otherM2.push(n);
  }
  if (exclusiveM2[0] != null) return exclusiveM2[0];
  if (exclusivePyeong[0] != null) return exclusivePyeong[0] * M2_PER_PYEONG;
  return otherM2[0];
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
