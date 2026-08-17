import {
  type PropertyType,
  type SalesType,
  type Source,
} from "./types";

export const sourceLabel: Record<Source, string> = {
  zigbang: "Zigbang",
  naver: "Naver",
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

const floorTokenLabel: Record<string, string> = {
  고: "top",
  중: "middle",
  저: "low",
  반지하: "semi-basement",
  옥탑: "rooftop",
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

export function formatPrice(listing: {
  salesType?: SalesType;
  deposit?: number;
  rent?: number;
  price?: number;
}): string | null {
  if (listing.salesType === "sale" && listing.price != null) {
    return formatKrwFromManwon(listing.price);
  }
  if (listing.salesType === "wolse") {
    const deposit = formatKrwFromManwon(listing.deposit);
    const rent = formatKrwFromManwon(listing.rent ?? 0);
    if (deposit && rent) return `${deposit} deposit · ${rent} / month`;
    return deposit ?? rent;
  }
  if (listing.deposit != null) {
    return formatKrwFromManwon(listing.deposit);
  }
  return formatKrwFromManwon(listing.price);
}

export function formatArea(areaM2?: number): string | null {
  if (areaM2 == null || !Number.isFinite(areaM2)) return null;
  const pyeong = areaM2 / 3.3058;
  return `${areaM2.toLocaleString("en-US")} m² (${pyeong.toFixed(1)} pyeong)`;
}

export function formatFloor(value?: string): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "");
  const [rawFloor, rawTotal] = normalized.split("/");
  if (!rawFloor) return value;
  const named = floorTokenLabel[rawFloor];
  if (named && rawTotal) {
    if (rawFloor === "고") return `Top floor of ${rawTotal}`;
    if (rawFloor === "중") return `Middle floor of ${rawTotal}`;
    if (rawFloor === "저") return `Lower floor of ${rawTotal}`;
    return `${named} of ${rawTotal}`;
  }
  if (named) return named;
  if (!rawTotal) return `Floor ${rawFloor}`;
  return `Floor ${rawFloor} of ${rawTotal}`;
}

export function formatRoomType(value?: string): string | null {
  if (!value) return null;
  return roomTypeLabel[value] ?? value;
}

export function friendlySourceError(source: Source, message: string): string {
  if (source === "naver") {
    return "Naver listings are unavailable right now.";
  }
  return `${sourceLabel[source]}: ${message}`;
}
