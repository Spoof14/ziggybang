import { DEFAULT_LANG, type Lang } from "~/lib/i18n";
import {
  formatArea,
  formatFloor,
  formatRoomType,
  propertyTypeText,
  salesTypeFilterText,
} from "./copy";
import { placeEn, placeKo, type Place } from "~/lib/geo/places";
import { hasHangul } from "./foreigner";
import { matchPlaceInAddress } from "./search";
import { type MapListing } from "./types";

const DISTRICT_LABEL: Record<string, string> = {
  강남구: "Gangnam-gu",
  강동구: "Gangdong-gu",
  강북구: "Gangbuk-gu",
  강서구: "Gangseo-gu",
  관악구: "Gwanak-gu",
  광진구: "Gwangjin-gu",
  구로구: "Guro-gu",
  금천구: "Geumcheon-gu",
  노원구: "Nowon-gu",
  도봉구: "Dobong-gu",
  동대문구: "Dongdaemun-gu",
  동작구: "Dongjak-gu",
  마포구: "Mapo-gu",
  서대문구: "Seodaemun-gu",
  서초구: "Seocho-gu",
  성동구: "Seongdong-gu",
  성북구: "Seongbuk-gu",
  송파구: "Songpa-gu",
  양천구: "Yangcheon-gu",
  영등포구: "Yeongdeungpo-gu",
  용산구: "Yongsan-gu",
  은평구: "Eunpyeong-gu",
  종로구: "Jongno-gu",
  중구: "Jung-gu",
  중랑구: "Jungnang-gu",
  분당구: "Bundang-gu",
  수정구: "Sujeong-gu",
  중원구: "Jungwon-gu",
  수원시: "Suwon",
  성남시: "Seongnam",
  용인시: "Yongin",
  고양시: "Goyang",
  부천시: "Bucheon",
  인천시: "Incheon",
  인천광역시: "Incheon",
  서울시: "Seoul",
  서울특별시: "Seoul",
  부산시: "Busan",
  부산광역시: "Busan",
};

/** The Korean 구 named in an address ("마포구", or Latin "Mapo-gu" mapped back), if any. */
export function addressGu(address?: string): string | null {
  if (!address) return null;
  const korean = /[가-힣]+구/.exec(address)?.[0];
  if (korean) return korean;
  const latin = /([A-Za-z]+)-gu/i.exec(address)?.[0]?.toLowerCase();
  if (!latin) return null;
  for (const [ko, en] of Object.entries(DISTRICT_LABEL)) if (en.toLowerCase() === latin) return ko;
  return null;
}

/**
 * Neighbourhood from the place table, but never one that contradicts the
 * address's own district (a "Seongsu" hit inside a 강남구 address is dropped).
 */
function consistentPlace(address?: string): Place | undefined {
  if (!address) return undefined;
  const place = matchPlaceInAddress(address);
  if (!place) return undefined;
  const gu = addressGu(address);
  if (place.gu && gu && place.gu !== gu) return undefined;
  return place;
}

export function englishNeighborhood(address?: string): string | null {
  const place = consistentPlace(address);
  return place ? placeEn(place) : null;
}

export function englishDistrict(address?: string): string | null {
  if (!address) return null;
  let best: { label: string; length: number } | undefined;
  for (const [korean, label] of Object.entries(DISTRICT_LABEL)) {
    if (!address.includes(korean)) continue;
    if (!best || korean.length > best.length) {
      best = { label, length: korean.length };
    }
  }
  const latin = (/[A-Za-z-]+-gu/i.exec(address))?.[0];
  if (latin) {
    const label = `${latin.charAt(0).toUpperCase()}${latin.slice(1).toLowerCase()}`;
    if (!best || latin.length > best.length) return label;
  }
  return best?.label ?? null;
}

/** Korean neighborhood name for a listing ("홍대"), when the place table knows it. */
export function koreanNeighborhood(address?: string): string | null {
  const place = consistentPlace(address);
  return place ? placeKo(place) : null;
}

function localNeighborhood(address: string | undefined, lang: Lang): string | null {
  if (lang === "ko") return koreanNeighborhood(address);
  return englishNeighborhood(address);
}

/** The Korean address as listed, trimmed to "시/구/동" level when it is a long road address. */
function koreanAddressLine(listing: MapListing): string | null {
  const address = listing.address?.trim();
  if (!address) return null;
  if (!hasHangul(address)) return englishDistrict(address) ?? address;
  const hood = koreanNeighborhood(address);
  const district = (/[가-힣]+구/.exec(address))?.[0];
  if (hood && district) return hood === district.replace(/구$/, "") ? district : `${hood} · ${district}`;
  return hood ?? district ?? address;
}

/**
 * Card/panel title. English users get "Hongdae · Studio · Monthly"; Korean
 * users get the same pieces in Korean ("홍대 · 원룸 · 월세") with Korean place names.
 */
export function englishCardTitle(listing: MapListing, lang: Lang = DEFAULT_LANG): string {
  const where = localNeighborhood(listing.address, lang);
  const layout = formatRoomType(listing.roomType, lang);
  const kind = propertyTypeText(lang, listing.propertyType);
  const deal = listing.salesType ? salesTypeFilterText(lang, listing.salesType) : null;
  const room = layout && layout !== kind ? layout : kind;
  return [where, room, deal].filter(Boolean).join(" · ");
}

export function englishAddressLine(listing: MapListing, lang: Lang = DEFAULT_LANG): string | null {
  if (lang === "ko") return koreanAddressLine(listing);
  const where = englishNeighborhood(listing.address);
  const district = englishDistrict(listing.address);
  if (where && district) {
    const same =
      where.replace(/-gu$/i, "").toLowerCase() ===
      district.replace(/-gu$/i, "").toLowerCase();
    return same ? district : `${where} · ${district}`;
  }
  return where ?? district ?? listing.address ?? null;
}

export function koreanAddressForTaxi(address?: string): string | null {
  if (!address?.trim()) return null;
  return address.trim();
}

export function listingCardMeta(listing: MapListing, lang: Lang = DEFAULT_LANG): string {
  return [
    englishAddressLine(listing, lang),
    formatArea(listing.areaM2, lang),
    formatFloor(listing.floor, lang),
  ]
    .filter(Boolean)
    .join(" · ");
}
