import {
  type PropertyType,
  type SalesType,
  type Source,
} from "./types";

export const sourceLabel: Record<Source, string> = {
  zigbang: "Zigbang",
  naver: "Naver",
  peterpan: "Peterpan",
};

export const propertyTypeLabel: Record<PropertyType, string> = {
  oneroom: "Studio",
  villa: "Villa",
  officetel: "Officetel",
  apartment: "Apartment",
};

export const salesTypeLabel: Record<SalesType, string> = {
  jeonse: "Jeonse",
  wolse: "Monthly rent",
  sale: "For sale",
};

export const salesTypeFilterLabel: Record<SalesType, string> = {
  jeonse: "Jeonse",
  wolse: "Monthly",
  sale: "Sale",
};

export const salesTypeHint: Record<SalesType, string> = {
  jeonse: "Large refundable deposit, no monthly rent",
  wolse: "Smaller deposit plus monthly rent",
  sale: "Purchase price",
};

const roomTypeLabel: Record<string, string> = {
  분리형원룸: "Split studio",
  오픈형원룸: "Open studio",
  복층원룸: "Loft studio",
  원룸: "Studio",
  투룸: "Two-room",
  쓰리룸: "Three-room",
  포룸: "Four-room",
};

export function formatKrwFromManwon(manwon?: number): string | null {
  if (manwon == null || !Number.isFinite(manwon)) return null;
  const krw = Math.round(manwon * 10_000);
  if (krw >= 1_000_000_000) {
    const billions = Math.round((krw / 1_000_000_000) * 100) / 100;
    return `₩${billions.toLocaleString("en-US")} billion`;
  }
  if (krw >= 10_000_000) {
    const millions = krw / 1_000_000;
    const rounded =
      millions >= 100 ? Math.round(millions) : Math.round(millions * 10) / 10;
    return `₩${rounded.toLocaleString("en-US")} million`;
  }
  return `₩${krw.toLocaleString("en-US")}`;
}

export function formatPriceLines(listing: {
  salesType?: SalesType;
  deposit?: number;
  rent?: number;
  price?: number;
}): string[] {
  if (listing.salesType === "sale" && listing.price != null) {
    const sale = formatKrwFromManwon(listing.price);
    return sale ? [sale] : [];
  }
  if (listing.salesType === "wolse") {
    const deposit = formatKrwFromManwon(listing.deposit);
    const rent = formatKrwFromManwon(listing.rent ?? 0);
    if (deposit && rent) return [`${deposit} deposit`, `${rent} / month`];
    return [deposit ?? rent].filter((line): line is string => Boolean(line));
  }
  const lump = formatKrwFromManwon(listing.deposit ?? listing.price);
  return lump ? [lump] : [];
}

export function formatPrice(listing: {
  salesType?: SalesType;
  deposit?: number;
  rent?: number;
  price?: number;
}): string | null {
  const lines = formatPriceLines(listing);
  return lines.length ? lines.join(" · ") : null;
}

export function formatArea(areaM2?: number): string | null {
  if (areaM2 == null || !Number.isFinite(areaM2)) return null;
  const pyeong = areaM2 / 3.3058;
  return `${areaM2.toLocaleString("en-US")} m² (${pyeong.toFixed(1)} pyeong)`;
}

/**
 * Korean floor labels → English. "반지하/2" → "Semi-basement", "옥탑방/4" →
 * "Rooftop", "고/21" → "High floor of 21", "고층/11층" → "High floor of 11",
 * "11층" → "Floor 11", "9/21" → "Floor 9 of 21".
 */
export function formatFloor(value?: string): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "");
  if (!normalized) return null;
  const [rawFloor = "", rawTotal] = normalized.split("/");
  const total = rawTotal?.replace(/층$/, "");
  const head = rawFloor.replace(/층$/, "");
  if (/반지하|반지층/.test(head)) return "Semi-basement";
  if (/옥탑/.test(head)) return "Rooftop";
  if (/^(지하|B-?\d)/i.test(head)) return "Basement";
  const band = /^(고|중|저)(층)?$/.exec(head)?.[1];
  if (band) {
    const label = band === "고" ? "High floor" : band === "중" ? "Mid floor" : "Low floor";
    return total && /^\d+$/.test(total) ? `${label} of ${total}` : label;
  }
  if (/^\d+$/.test(head)) {
    return total && /^\d+$/.test(total) ? `Floor ${head} of ${total}` : `Floor ${head}`;
  }
  return value;
}

export function formatRoomType(value?: string): string | null {
  if (!value) return null;
  return roomTypeLabel[value] ?? value;
}

export function friendlySourceError(source: Source, message: string): string {
  if (source === "naver") {
    return "Naver is blocked from this server without a Korean home/residential proxy. Set NAVER_PROXY_URL (or BRIGHTDATA_API_KEY) and the app will fetch a session token automatically. Or turn the Naver chip off — Zigbang and Peterpan still work.";
  }
  return `${sourceLabel[source]}: ${message}`;
}
