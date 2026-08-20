import { areaBuckets, type AreaBucketId } from "./area";
import {
  propertyTypeLabel,
  salesTypeFilterLabel,
} from "./copy";
import { floorFilterLabel, parseFloorFilter, type FloorFilter } from "./floor";
import { type ViewMode } from "./prefs";
import {
  describePriceFilter,
  normalizePriceFilter,
  type PriceFilter,
} from "./price";
import {
  isStationQuery,
  listingFilterQuery,
  matchPlace,
  unrefinedPlaceLeftover,
} from "./search";
import {
  propertyTypes,
  salesTypes,
  type PropertyType,
  type SalesType,
} from "./types";

export type SearchSnapshot = {
  searchInput: string;
  propertyTypes: PropertyType[];
  salesTypes: SalesType[];
  areaBucketIds: AreaBucketId[];
  radiusM: number;
  viewMode: ViewMode;
} & PriceFilter & { foreignerOk?: boolean; floorFilter?: FloorFilter };

export type SearchIntent = {
  searchInput?: string | null;
  propertyTypes?: PropertyType[] | null;
  salesTypes?: SalesType[] | null;
  areaBucketIds?: AreaBucketId[] | null;
  radiusM?: number | null;
  viewMode?: ViewMode | null;
  minDeposit?: number | null;
  maxDeposit?: number | null;
  minRent?: number | null;
  maxRent?: number | null;
  foreignerOk?: boolean | null;
  floorFilter?: FloorFilter | null;
};

export type InterpretedSearch = {
  intent: SearchIntent;
  snapshot: SearchSnapshot;
  reply: string;
};

type MoneyKind = "deposit" | "rent";
type MoneyBound = "min" | "max";

type MoneyHit = {
  manwon: number;
  index: number;
  end: number;
  raw: string;
};

const ALL_TYPES: PropertyType[] = [...propertyTypes];
const ALL_SALES: SalesType[] = [...salesTypes];

function round10(value: number) {
  return Math.round(value / 10) * 10 || value;
}

function parseManwonToken(amount: number, unit: string | undefined): number | undefined {
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const suffix = (unit ?? "").toLowerCase().replace(/\s+/g, "");
  if (suffix === "억") return Math.round(amount * 10_000);
  if (suffix === "만" || suffix === "만원" || suffix === "만원이하" || suffix === "만워") {
    return Math.round(amount);
  }
  if (suffix === "million" || suffix === "mil" || suffix === "m") {
    return Math.round(amount * 100);
  }
  if (suffix === "k") return Math.round((amount * 1000) / 10_000);
  if (suffix === "원" || suffix === "krw" || suffix === "won") {
    return Math.round(amount / 10_000);
  }
  if (amount >= 10_000) return Math.round(amount / 10_000);
  return Math.round(amount);
}

function extractMoney(text: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const re =
    /₩?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(억|만원|만\s*원|만|million|mil\b|m\b|k\b|원|krw|won)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = match[0] ?? "";
    const after = text.slice(match.index + raw.length, match.index + raw.length + 12);
    if (/\s*(pyeong|py\b|m²|m2|sqm|meters?|minute|min\b|km|m\b)/i.test(after)) {
      continue;
    }
    const amount = Number((match[1] ?? "").replace(/,/g, ""));
    const manwon = parseManwonToken(amount, match[2]);
    if (manwon == null || manwon <= 0) continue;
    hits.push({
      manwon,
      index: match.index,
      end: match.index + raw.length,
      raw,
    });
  }
  return hits;
}

function leftRight(text: string, hit: MoneyHit, leftN = 48, rightN = 18) {
  return {
    left: text.slice(Math.max(0, hit.index - leftN), hit.index),
    right: text.slice(hit.end, Math.min(text.length, hit.end + rightN)),
  };
}

function lastMatchIndex(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let best = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) best = match.index;
  return best;
}

function classifyKind(text: string, hit: MoneyHit): MoneyKind {
  const { left, right } = leftRight(text, hit);
  const depositRe = /deposit|보증금|key money|down payment|전세/i;
  const rentRe = /rent|monthly|월세|a month|per month|\/\s*mo|budget/i;
  const depositAt = lastMatchIndex(left, depositRe);
  const rentAt = lastMatchIndex(left, rentRe);
  if (depositAt >= 0 || rentAt >= 0) {
    return depositAt > rentAt ? "deposit" : "rent";
  }
  if (rentRe.test(right) && !depositRe.test(right)) return "rent";
  if (depositRe.test(right) && !rentRe.test(right)) return "deposit";
  return hit.manwon > 300 ? "deposit" : "rent";
}

function classifyBound(text: string, hit: MoneyHit): MoneyBound {
  const { left } = leftRight(text, hit);
  if (
    /min(?:imum)?|at least|over|above|more than|from|starting|≥|>=|이상|최소/i.test(
      left,
    )
  ) {
    return "min";
  }
  return "max";
}

function parsePriceIntent(text: string): PriceFilter {
  const hits = extractMoney(text);
  const next: PriceFilter = {};
  const between = text.match(
    /(?:between|from)\s+([^,]+?)\s+(?:and|to|-)\s+([^,]+?)(?:\s+(deposit|rent|monthly|보증금|월세))?/i,
  );
  if (between) {
    const left = extractMoney(between[1] ?? "")[0];
    const right = extractMoney(between[2] ?? "")[0];
    const kind: MoneyKind = /rent|monthly|월세/i.test(between[0] ?? "")
      ? "rent"
      : /deposit|보증금/i.test(between[0] ?? "")
        ? "deposit"
        : left && left.manwon > 300
          ? "deposit"
          : "rent";
    if (left && right) {
      const min = Math.min(left.manwon, right.manwon);
      const max = Math.max(left.manwon, right.manwon);
      if (kind === "rent") {
        next.minRent = min;
        next.maxRent = max;
      } else {
        next.minDeposit = min;
        next.maxDeposit = max;
      }
    }
  }

  const dash = text.match(
    /(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)\s*(만|만원|억)?\s*(deposit|rent|monthly|보증금|월세)?/i,
  );
  if (dash && next.minDeposit == null && next.minRent == null) {
    const unit = dash[3];
    const left = parseManwonToken(Number(dash[1]), unit);
    const right = parseManwonToken(Number(dash[2]), unit);
    const kind: MoneyKind = /rent|monthly|월세/i.test(dash[4] ?? dash[0] ?? "")
      ? "rent"
      : /deposit|보증금/i.test(dash[4] ?? dash[0] ?? "")
        ? "deposit"
        : (left ?? 0) > 300
          ? "deposit"
          : "rent";
    if (left && right) {
      if (kind === "rent") {
        next.minRent = Math.min(left, right);
        next.maxRent = Math.max(left, right);
      } else {
        next.minDeposit = Math.min(left, right);
        next.maxDeposit = Math.max(left, right);
      }
    }
  }

  for (const hit of hits) {
    const kind = classifyKind(text, hit);
    const bound = classifyBound(text, hit);
    if (kind === "deposit") {
      if (bound === "min" && next.minDeposit == null) next.minDeposit = hit.manwon;
      if (bound === "max" && next.maxDeposit == null) next.maxDeposit = hit.manwon;
    } else {
      if (bound === "min" && next.minRent == null) next.minRent = hit.manwon;
      if (bound === "max" && next.maxRent == null) next.maxRent = hit.manwon;
    }
  }
  return normalizePriceFilter(next);
}

function parsePropertyTypes(text: string): PropertyType[] | undefined {
  const types: PropertyType[] = [];
  if (/studio|one-?room|원룸|오픈형|분리형/i.test(text)) types.push("oneroom");
  if (/\bvillas?\b|빌라|주택/i.test(text)) types.push("villa");
  if (/officetel|oftel|오피스텔/i.test(text)) types.push("officetel");
  if (/\bapartments?\b|\bapt\b|아파트/i.test(text)) types.push("apartment");
  if (!types.length) return undefined;
  return types;
}

function parseSalesTypes(text: string, price: PriceFilter): SalesType[] | undefined {
  const types: SalesType[] = [];
  if (/jeonse|전세|key money/i.test(text)) types.push("jeonse");
  if (/wolse|월세|monthly|\brent\b|a month|per month/i.test(text)) types.push("wolse");
  if (/\b(sale|buy|purchase|매매)\b/i.test(text)) types.push("sale");
  if (!types.length && (price.minRent != null || price.maxRent != null)) {
    types.push("wolse");
  }
  if (!types.length) return undefined;
  return types;
}

function parseAreaBuckets(text: string): AreaBucketId[] | undefined {
  if (/tiny|compact|very small|under 20|xs\b|< ?6 py/i.test(text)) return ["xs"];
  if (/small studio|6-?10 py|20-?33/i.test(text)) return ["s"];
  if (/family|spacious|large|50\+|15\+ py/i.test(text)) return ["l"];
  if (/10-?15 py|33-?50/i.test(text)) return ["m"];
  const pyeong = text.match(/(\d+(?:\.\d+)?)\s*(?:pyeong|py)\b/i);
  if (pyeong) {
    const value = Number(pyeong[1]);
    const m2 = value * 3.3058;
    const match = areaBuckets.filter((bucket) => {
      if (m2 < bucket.minM2) return false;
      if (bucket.maxM2 != null && m2 >= bucket.maxM2) return false;
      return true;
    });
    if (match[0]) return [match[0].id];
  }
  return undefined;
}

function parseRadius(text: string): number | undefined {
  const meters = text.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?|m|meters?)\b/i);
  if (meters) {
    const value = Number(meters[1]);
    const radiusM = /km/i.test(meters[2] ?? "") ? value * 1000 : value;
    if (Number.isFinite(radiusM)) {
      return Math.min(3000, Math.max(250, Math.round(radiusM)));
    }
  }
  if (/walk(?:ing)? distance|near(?:by)? (?:the )?station|도보/i.test(text)) {
    return 800;
  }
  if (/\bnear\b|\baround\b|\bclose to\b|근처/i.test(text)) return 1000;
  return undefined;
}

function relativePrice(text: string, current: SearchSnapshot): PriceFilter {
  const cheaper = /\b(cheaper|lower budget|too expensive|less rent|bring.*down)\b/i.test(text);
  const higher = /\b(higher budget|more rent|can spend more|a bit more)\b/i.test(text);
  if (!cheaper && !higher) return {};
  const factor = cheaper ? 0.8 : 1.25;
  const next: PriceFilter = {};
  if (current.maxRent != null) next.maxRent = Math.max(10, round10(current.maxRent * factor));
  else if (cheaper) next.maxRent = 70;
  if (current.maxDeposit != null) {
    next.maxDeposit = Math.max(50, round10(current.maxDeposit * factor));
  }
  return next;
}

export function mergeSearchIntent(
  current: SearchSnapshot,
  patch: SearchIntent,
): SearchSnapshot {
  const price = normalizePriceFilter({
    minDeposit: patch.minDeposit === null ? undefined : (patch.minDeposit ?? current.minDeposit),
    maxDeposit: patch.maxDeposit === null ? undefined : (patch.maxDeposit ?? current.maxDeposit),
    minRent: patch.minRent === null ? undefined : (patch.minRent ?? current.minRent),
    maxRent: patch.maxRent === null ? undefined : (patch.maxRent ?? current.maxRent),
  });
  const propertyTypesNext =
    patch.propertyTypes === null
      ? ALL_TYPES
      : patch.propertyTypes?.length
        ? patch.propertyTypes
        : current.propertyTypes;
  const salesTypesNext =
    patch.salesTypes === null
      ? ALL_SALES
      : patch.salesTypes?.length
        ? patch.salesTypes
        : current.salesTypes;
  const areas =
    patch.areaBucketIds === null
      ? []
      : patch.areaBucketIds
        ? patch.areaBucketIds
        : current.areaBucketIds;
  return {
    searchInput:
      patch.searchInput === null ? "" : (patch.searchInput ?? current.searchInput),
    propertyTypes: propertyTypesNext.length ? propertyTypesNext : ALL_TYPES,
    salesTypes: salesTypesNext.length ? salesTypesNext : ALL_SALES,
    areaBucketIds: areas,
    radiusM:
      patch.radiusM === null
        ? 1200
        : patch.radiusM != null
          ? Math.min(3000, Math.max(250, patch.radiusM))
          : current.radiusM,
    viewMode: patch.viewMode === null ? "map" : (patch.viewMode ?? current.viewMode),
    foreignerOk:
      patch.foreignerOk === null ? false : (patch.foreignerOk ?? current.foreignerOk),
    floorFilter:
      patch.floorFilter === null ? undefined : (patch.floorFilter ?? current.floorFilter),
    ...price,
  };
}

export function describeSearchSnapshot(snapshot: SearchSnapshot): string {
  const where = snapshot.searchInput.trim() || "the current map";
  const types = snapshot.propertyTypes.length && snapshot.propertyTypes.length < ALL_TYPES.length
    ? snapshot.propertyTypes.map((type) => propertyTypeLabel[type]).join(", ")
    : "homes";
  const deals = snapshot.salesTypes.length && snapshot.salesTypes.length < ALL_SALES.length
    ? snapshot.salesTypes.map((type) => salesTypeFilterLabel[type]).join(" / ")
    : null;
  const price = describePriceFilter(snapshot);
  const size = snapshot.areaBucketIds.length
    ? areaBuckets
        .filter((bucket) => snapshot.areaBucketIds.includes(bucket.id))
        .map((bucket) => bucket.label)
        .join(", ")
    : null;
  return [
    `Looking for ${deals ? deals.toLowerCase() : ""} ${types} near ${where}.`.replace(/\s+/g, " "),
    price,
    size ? `Size: ${size}.` : null,
    snapshot.foreignerOk ? "Only listings that say foreigners are welcome." : null,
    snapshot.floorFilter ? `${floorFilterLabel[snapshot.floorFilter]}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function isFollowUp(text: string): boolean {
  return /^(?:a bit )?cheaper\b|higher budget|too expensive|clear |anywhere|less rent|more rent|make (?:the )?(?:rent|deposit)|bring (?:it|the rent) down/i.test(
    text.trim(),
  );
}

export function interpretSearch(
  message: string,
  current: SearchSnapshot,
): InterpretedSearch {
  const text = message.trim();
  const intent: SearchIntent = {};
  const followUp = isFollowUp(text);
  const place = followUp ? undefined : matchPlace(text);
  if (place) {
    const geoLeftover = unrefinedPlaceLeftover(text, place);
    if (isStationQuery(text)) {
      intent.searchInput = `${place.names[0]} station`;
    } else if (geoLeftover) {
      intent.searchInput = `${place.names[0]} ${geoLeftover}`;
    } else {
      intent.searchInput = place.names[0] ?? place.id;
    }
  }
  const leftover = followUp ? undefined : listingFilterQuery(text, place) || undefined;
  if (leftover && intent.searchInput) {
    intent.searchInput = `${intent.searchInput} ${leftover}`;
  } else if (leftover && !place) {
    intent.searchInput = leftover;
  }

  const price = {
    ...relativePrice(text, current),
    ...parsePriceIntent(text),
  };
  if (price.minDeposit != null) intent.minDeposit = price.minDeposit;
  if (price.maxDeposit != null) intent.maxDeposit = price.maxDeposit;
  if (price.minRent != null) intent.minRent = price.minRent;
  if (price.maxRent != null) intent.maxRent = price.maxRent;

  const types = parsePropertyTypes(text);
  if (types) intent.propertyTypes = types;
  const sales = parseSalesTypes(text, price);
  if (sales) intent.salesTypes = sales;
  const areas = parseAreaBuckets(text);
  if (areas) intent.areaBucketIds = areas;
  const radiusM = parseRadius(text) ?? (place ? (place.radiusM ?? undefined) : undefined);
  if (radiusM) intent.radiusM = radiusM;
  if (/\bon the map\b|\bmap view\b/i.test(text)) intent.viewMode = "map";
  else if (
    /recommend|best value|best (?:homes?|places?|apartments?|studios?)|nicest|good photos|for me\b/i.test(
      text,
    )
  ) {
    intent.viewMode = "best";
  } else intent.viewMode = "list";

  if (/clear (the )?(price|budget|deposit|rent)|any budget|no price/i.test(text)) {
    intent.minDeposit = null;
    intent.maxDeposit = null;
    intent.minRent = null;
    intent.maxRent = null;
  }
  if (/anywhere|clear (the )?(area|place|search)/i.test(text)) {
    intent.searchInput = null;
  }
  if (
    /foreigners?\s+welcome|accepts?\s+foreigners?|외국인\s*(환영|가능)|for foreigners/i.test(
      text,
    )
  ) {
    intent.foreignerOk = true;
  }
  if (/any landlord|clear foreigner/i.test(text)) {
    intent.foreignerOk = null;
  }
  const floor = followUp ? { floorFilter: undefined } : parseFloorFilter(text);
  if (floor.floorFilter) intent.floorFilter = floor.floorFilter;
  if (/any floor|clear floor|basement (ok|fine)|include basement/i.test(text)) {
    intent.floorFilter = null;
  }

  const snapshot = mergeSearchIntent(current, intent);
  const reply = describeSearchSnapshot(snapshot);
  return { intent, snapshot, reply };
}

export const ASK_SUGGESTIONS = [
  "Best value studios near Hongdae, with decent photos",
  "Studio in Hongdae, monthly under ₩800,000, deposit under ₩20 million",
  "No basement near Guro Digital",
];
