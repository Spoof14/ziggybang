export const floorFilters = ["no-basement", "min-2", "min-5"] as const;
export type FloorFilter = (typeof floorFilters)[number];

export const floorFilterLabel: Record<FloorFilter, string> = {
  "no-basement": "No basement",
  "min-2": "2F+",
  "min-5": "5F+",
};

const NO_BASEMENT =
  /no\s+(semi-?)?basements?|not\s+(a\s+)?basements?|exclude\s+basements?|without\s+(an?\s+)?(semi-?)?basements?|반지하\s*(제외|없는|싫)|지하\s*제외/i;
const MIN_2 =
  /\b(2nd\s+floors?\+?|2f\+|floors?\s*2\+|second floor(?:s)?(?:\s+or\s+(?:up|higher|above))?|above (?:the )?(?:first|1st|ground)|저층\s*제외)/i;
const MIN_5 = /\b(high floors?|5th\s+floors?\+?|5f\+|floors?\s*5\+|fifth floor|고층)/i;

export function parseFloorFilter(text: string): {
  floorFilter?: FloorFilter;
  rest: string;
} {
  let rest = text;
  let floorFilter: FloorFilter | undefined;
  if (MIN_5.test(rest)) {
    floorFilter = "min-5";
    rest = rest.replace(MIN_5, " ");
  } else if (MIN_2.test(rest)) {
    floorFilter = "min-2";
    rest = rest.replace(MIN_2, " ");
  }
  if (NO_BASEMENT.test(rest)) {
    floorFilter ??= "no-basement";
    rest = rest.replace(NO_BASEMENT, " ");
  }
  return { floorFilter, rest: rest.replace(/\s+/g, " ").trim() };
}

export function isBasementFloor(floor?: string): boolean {
  if (!floor) return false;
  const compact = floor.replace(/\s+/g, "");
  if (/옥탑/.test(compact)) return false;
  return /반지하|지하|basement|\bB-?\d/i.test(compact);
}

export function floorNumber(floor?: string): number | undefined {
  if (!floor) return undefined;
  const compact = floor.replace(/\s+/g, "");
  if (isBasementFloor(compact)) return 0;
  if (/옥탑/.test(compact)) return 99;
  if (compact.startsWith("고")) return 8;
  if (compact.startsWith("중")) return 3;
  if (compact.startsWith("저")) return 1;
  const numeric = Number.parseInt(compact, 10);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function listingMatchesFloor(
  floor: string | undefined,
  filter: FloorFilter | undefined,
  requireDetails: boolean,
): boolean {
  if (!filter) return true;
  if (!floor) return !requireDetails;
  if (isBasementFloor(floor)) return false;
  if (filter === "no-basement") return true;
  const numeric = floorNumber(floor);
  if (numeric == null) return !requireDetails;
  if (filter === "min-2") return numeric >= 2;
  return numeric >= 5;
}
