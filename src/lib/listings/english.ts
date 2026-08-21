import {
  formatArea,
  formatFloor,
  formatRoomType,
  propertyTypeLabel,
  salesTypeFilterLabel,
} from "./copy";
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

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function englishNeighborhood(address?: string): string | null {
  if (!address) return null;
  const place = matchPlaceInAddress(address);
  if (!place) return null;
  return titleCase(place.names[0] ?? place.id);
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
  const latin = address.match(/[A-Za-z-]+-gu/i)?.[0];
  if (latin) {
    const label = `${latin.charAt(0).toUpperCase()}${latin.slice(1).toLowerCase()}`;
    if (!best || latin.length > best.length) return label;
  }
  return best?.label ?? null;
}

export function englishCardTitle(listing: MapListing): string {
  const where = englishNeighborhood(listing.address);
  const layout = formatRoomType(listing.roomType);
  const kind = propertyTypeLabel[listing.propertyType];
  const deal = listing.salesType ? salesTypeFilterLabel[listing.salesType] : null;
  const room = layout && layout !== kind ? layout : kind;
  return [where, room, deal].filter(Boolean).join(" · ");
}

export function englishAddressLine(listing: MapListing): string | null {
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

export function listingCardMeta(listing: MapListing): string {
  return [
    englishAddressLine(listing),
    formatArea(listing.areaM2),
    formatFloor(listing.floor),
  ]
    .filter(Boolean)
    .join(" · ");
}
