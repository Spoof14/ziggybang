import { DEFAULT_LANG, localeOf, t, type Lang } from "~/lib/i18n";
import {
  type PropertyType,
  type SalesType,
  type Source,
} from "./types";

export function sourceText(lang: Lang, source: Source): string {
  return t(lang, `source.${source}`);
}
export function propertyTypeText(lang: Lang, type: PropertyType): string {
  return t(lang, `type.${type}`);
}
export function salesTypeText(lang: Lang, type: SalesType): string {
  return t(lang, `sale.${type}`);
}
export function salesTypeFilterText(lang: Lang, type: SalesType): string {
  return t(lang, `saleFilter.${type}`);
}
export function salesTypeHintText(lang: Lang, type: SalesType): string {
  return t(lang, `saleHint.${type}`);
}

// English defaults, kept for callers that have no language in scope.
export const sourceLabel: Record<Source, string> = {
  zigbang: sourceText("en", "zigbang"),
  naver: sourceText("en", "naver"),
  peterpan: sourceText("en", "peterpan"),
};
export const propertyTypeLabel: Record<PropertyType, string> = {
  oneroom: propertyTypeText("en", "oneroom"),
  villa: propertyTypeText("en", "villa"),
  officetel: propertyTypeText("en", "officetel"),
  apartment: propertyTypeText("en", "apartment"),
};
export const salesTypeLabel: Record<SalesType, string> = {
  jeonse: salesTypeText("en", "jeonse"),
  wolse: salesTypeText("en", "wolse"),
  sale: salesTypeText("en", "sale"),
};
export const salesTypeFilterLabel: Record<SalesType, string> = {
  jeonse: salesTypeFilterText("en", "jeonse"),
  wolse: salesTypeFilterText("en", "wolse"),
  sale: salesTypeFilterText("en", "sale"),
};
export const salesTypeHint: Record<SalesType, string> = {
  jeonse: salesTypeHintText("en", "jeonse"),
  wolse: salesTypeHintText("en", "wolse"),
  sale: salesTypeHintText("en", "sale"),
};

const ROOM_TYPE_KEY: Record<string, "split" | "open" | "loft" | "studio" | "two" | "three" | "four"> = {
  분리형원룸: "split",
  오픈형원룸: "open",
  복층원룸: "loft",
  원룸: "studio",
  투룸: "two",
  쓰리룸: "three",
  포룸: "four",
};

export function formatKrwFromManwon(manwon?: number, lang: Lang = DEFAULT_LANG): string | null {
  if (manwon == null || !Number.isFinite(manwon)) return null;
  const krw = Math.round(manwon * 10_000);
  const locale = localeOf(lang);
  if (lang === "ko") {
    // 1억 2,000만원 / 5,000만원 / 70만원 / 5,000원
    if (krw >= 100_000_000) {
      const eok = Math.floor(krw / 100_000_000);
      const restMan = Math.round((krw % 100_000_000) / 10_000);
      const eokText = `${eok.toLocaleString(locale)}억`;
      return restMan > 0
        ? `${eokText} ${restMan.toLocaleString(locale)}만원`
        : `${eokText}원`;
    }
    if (krw >= 10_000) {
      const man = Math.round(krw / 10_000);
      return t(lang, "money.million", { v: man.toLocaleString(locale) });
    }
    return t(lang, "money.plain", { v: krw.toLocaleString(locale) });
  }
  if (krw >= 1_000_000_000) {
    const billions = Math.round((krw / 1_000_000_000) * 100) / 100;
    return t(lang, "money.billion", { v: billions.toLocaleString(locale) });
  }
  if (krw >= 10_000_000) {
    const millions = krw / 1_000_000;
    const rounded =
      millions >= 100 ? Math.round(millions) : Math.round(millions * 10) / 10;
    return t(lang, "money.million", { v: rounded.toLocaleString(locale) });
  }
  return t(lang, "money.plain", { v: krw.toLocaleString(locale) });
}

type PriceLike = {
  salesType?: SalesType;
  deposit?: number;
  rent?: number;
  price?: number;
};

export function formatPriceLines(listing: PriceLike, lang: Lang = DEFAULT_LANG): string[] {
  if (listing.salesType === "sale" && listing.price != null) {
    const sale = formatKrwFromManwon(listing.price, lang);
    return sale ? [sale] : [];
  }
  if (listing.salesType === "wolse") {
    const deposit = formatKrwFromManwon(listing.deposit, lang);
    const rent = formatKrwFromManwon(listing.rent ?? 0, lang);
    if (deposit && rent) {
      return [t(lang, "money.deposit", { v: deposit }), t(lang, "money.perMonth", { v: rent })];
    }
    return [deposit ?? rent].filter((line): line is string => Boolean(line));
  }
  const lump = formatKrwFromManwon(listing.deposit ?? listing.price, lang);
  return lump ? [lump] : [];
}

export function formatPrice(listing: PriceLike, lang: Lang = DEFAULT_LANG): string | null {
  const lines = formatPriceLines(listing, lang);
  return lines.length ? lines.join(" · ") : null;
}

export function formatArea(areaM2?: number, lang: Lang = DEFAULT_LANG): string | null {
  if (areaM2 == null || !Number.isFinite(areaM2)) return null;
  const pyeong = areaM2 / 3.3058;
  return t(lang, "area.format", {
    m2: areaM2.toLocaleString(localeOf(lang)),
    py: pyeong.toFixed(1),
  });
}

/**
 * Korean floor labels → the UI language. English: "반지하/2" → "Semi-basement",
 * "옥탑방/4" → "Rooftop", "고/21" → "High floor of 21", "11층" → "Floor 11",
 * "9/21" → "Floor 9 of 21". Korean keeps the original wording ("9층 / 총 21층").
 */
export function formatFloor(value?: string, lang: Lang = DEFAULT_LANG): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "");
  if (!normalized) return null;
  const [rawFloor = "", rawTotal] = normalized.split("/");
  const total = rawTotal?.replace(/층$/, "");
  const head = rawFloor.replace(/층$/, "");
  const hasTotal = Boolean(total && /^\d+$/.test(total));
  if (/반지하|반지층/.test(head)) return t(lang, "floorText.semiBasement");
  if (head.includes('옥탑')) return t(lang, "floorText.rooftop");
  if (/^(지하|B-?\d)/i.test(head)) return t(lang, "floorText.basement");
  const band = /^(고|중|저)(층)?$/.exec(head)?.[1];
  if (band) {
    const label = t(lang, band === "고" ? "floorText.high" : band === "중" ? "floorText.mid" : "floorText.low");
    return hasTotal ? t(lang, "floorText.bandOf", { band: label, total: total! }) : label;
  }
  if (/^\d+$/.test(head)) {
    return hasTotal
      ? t(lang, "floorText.nOf", { n: head, total: total! })
      : t(lang, "floorText.n", { n: head });
  }
  return value;
}

export function formatRoomType(value?: string, lang: Lang = DEFAULT_LANG): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  const variant = /^원룸\((오픈|분리|복층)형?\)$/.exec(compact);
  const key = ROOM_TYPE_KEY[variant ? `${variant[1]}${variant[1] === "복층" ? "" : "형"}원룸` : compact];
  // Korean users keep the original wording; English users get a plain-English label.
  if (lang === "ko" || !key) return value;
  return t(lang, `room.${key}`);
}

export function friendlySourceError(
  source: Source,
  message: string,
  lang: Lang = DEFAULT_LANG,
): string {
  if (source === "naver") return t(lang, "err.naver");
  return t(lang, "err.source", { source: sourceText(lang, source), message });
}
