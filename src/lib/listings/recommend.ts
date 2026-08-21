import { places } from "~/lib/geo/places";
import { distanceM } from "~/lib/geo/shape";
import { englishDistrict, englishNeighborhood } from "./english";
import { type MapListing } from "./types";

export type PhotoScoreInput = {
  score: number;
  summary?: string;
  likelyFloorplan?: boolean;
  likelyDim?: boolean;
};

export type RankedListing = {
  listing: MapListing;
  score: number;
  reasons: string[];
  neighborhood: string | null;
  valueLabel: string | null;
  photoLabel: string | null;
};

const NEIGHBORHOOD_SCORE: Record<string, number> = {
  seongsu: 98,
  hapjeong: 96,
  yeonnam: 95,
  hongdae: 94,
  itaewon: 93,
  gangnam: 90,
  seocho: 88,
  jamsil: 87,
  yeouido: 86,
  dangsan: 85,
  magok: 84,
  gangseo: 73,
  sinchon: 82,
  yongsan: 82,
  jongno: 80,
  konkuk: 78,
  wangsimni: 76,
  munrae: 75,
  mokdong: 74,
  dongdaemun: 72,
  sadang: 70,
  mapo: 68,
  myeongdong: 66,
  yeongdeungpo: 62,
  bundang: 62,
  pangyo: 64,
  singil: 58,
  noryangjin: 55,
  sindorim: 54,
  sillim: 52,
  "guro-digital": 51,
  "gasan-digital": 51,
  guro: 50,
  gangbuk: 50,
  daerim: 48,
  seongnam: 48,
  suwon: 44,
  incheon: 42,
  busan: 40,
};

const IMPUTED_DEPOSIT_RATE = 0.05 / 12;

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function monthlyCostManwon(listing: MapListing): number | null {
  const manage = listing.manageCost ?? 0;
  if (listing.salesType === "sale") {
    if (listing.price == null || !Number.isFinite(listing.price)) return null;
    return listing.price * (0.04 / 12) + manage;
  }
  const deposit = listing.deposit ?? 0;
  const rent = listing.rent ?? 0;
  if (!Number.isFinite(deposit) && !Number.isFinite(rent)) return null;
  if (listing.salesType === "jeonse" || (listing.rent == null && listing.deposit != null)) {
    return deposit * IMPUTED_DEPOSIT_RATE + manage;
  }
  return rent + manage + deposit * IMPUTED_DEPOSIT_RATE;
}

export function valuePerM2(listing: MapListing): number | null {
  const monthly = monthlyCostManwon(listing);
  if (monthly == null || listing.areaM2 == null || listing.areaM2 < 6) return null;
  return monthly / listing.areaM2;
}

export function neighborhoodForListing(listing: MapListing): {
  id: string;
  label: string;
  score: number;
} {
  const address = listing.address ?? "";
  let named: { id: string; label: string; length: number } | undefined;
  for (const place of places) {
    const label = titleCase(place.names[0] ?? place.id);
    for (const name of place.names) {
      const hit = /[가-힣]/.test(name)
        ? address.includes(name)
        : Boolean(address) && address.toLowerCase().includes(name.toLowerCase());
      if (!hit) continue;
      if (!named || name.length > named.length) {
        named = { id: place.id, label, length: name.length };
      }
    }
  }
  if (named) {
    return {
      id: named.id,
      label: named.label,
      score: NEIGHBORHOOD_SCORE[named.id] ?? 50,
    };
  }

  let nearest: { id: string; label: string; meters: number } | undefined;
  for (const place of places) {
    const meters = distanceM(listing, place);
    if (meters > 1500) continue;
    if (!nearest || meters < nearest.meters) {
      nearest = {
        id: place.id,
        label: titleCase(place.names[0] ?? place.id),
        meters,
      };
    }
  }
  if (nearest) {
    return {
      id: nearest.id,
      label: nearest.label,
      score: NEIGHBORHOOD_SCORE[nearest.id] ?? 50,
    };
  }

  const inSeoul =
    listing.lat > 37.43 && listing.lat < 37.7 && listing.lng > 126.78 && listing.lng < 127.18;
  return {
    id: "other",
    label: englishNeighborhood(address) ?? englishDistrict(address) ?? "This area",
    score: inSeoul ? 48 : 36,
  };
}

export function livabilityScore(listing: MapListing): { score: number; reason: string | null } {
  const floor = (listing.floor ?? "").replace(/\s/g, "");
  if (/반지하|지하/.test(floor)) {
    return { score: 18, reason: "Semi-basement" };
  }
  if (/옥탑/.test(floor)) {
    return { score: 42, reason: "Rooftop unit" };
  }
  const numeric = Number.parseInt(floor, 10);
  if (floor.startsWith("저") || numeric === 1) {
    return { score: 56, reason: null };
  }
  if (floor.startsWith("고") || (Number.isFinite(numeric) && numeric >= 8)) {
    return { score: 78, reason: null };
  }
  if (Number.isFinite(numeric) && numeric >= 2 && numeric <= 7) {
    return { score: 84, reason: `Floor ${numeric}` };
  }
  if (listing.areaM2 != null && listing.areaM2 >= 20) {
    return { score: 70, reason: null };
  }
  return { score: 60, reason: null };
}

function photoCoverageScore(listing: MapListing): number {
  const count = listing.photos?.length ?? (listing.thumbnail ? 1 : 0);
  if (count >= 5) return 86;
  if (count >= 3) return 74;
  if (count === 2) return 64;
  if (count === 1) return 54;
  return 24;
}

function percentileScore(values: number[], value: number, lowerIsBetter: boolean): number {
  if (values.length < 2) return 55;
  const sorted = values.slice().sort((a, b) => a - b);
  let rank = sorted.findIndex((item) => item >= value);
  if (rank < 0) rank = sorted.length - 1;
  const pct = rank / (sorted.length - 1);
  const better = lowerIsBetter ? 1 - pct : pct;
  return Math.round(20 + better * 80);
}

export function rankListings(
  listings: MapListing[],
  photos: Record<string, PhotoScoreInput> = {},
): RankedListing[] {
  const values = listings
    .map(valuePerM2)
    .filter((value): value is number => value != null && Number.isFinite(value));

  return listings
    .map((listing) => {
      const area = neighborhoodForListing(listing);
      const live = livabilityScore(listing);
      const perM2 = valuePerM2(listing);
      const valueScore = perM2 == null ? 52 : percentileScore(values, perM2, true);
      const photo = listing.thumbnail ? photos[listing.thumbnail] : undefined;
      const photoScore = photo?.score ?? photoCoverageScore(listing);
      const score = Math.round(
        valueScore * 0.38 +
          area.score * 0.32 +
          photoScore * 0.18 +
          live.score * 0.12 +
          (listing.foreignerOk ? 6 : 0),
      );

      const reasons: string[] = [];
      let valueLabel: string | null = null;
      const photoLabel = photo?.summary ?? null;
      if (photo?.likelyFloorplan) reasons.push("Mostly a floorplan");
      else if (photo?.likelyDim) reasons.push("Dark photos");
      else if (photo && photo.score >= 72 && photoLabel) reasons.push(photoLabel);
      if (valueScore >= 78 && perM2 != null) {
        valueLabel = "Strong ₩/m²";
        reasons.push(valueLabel);
      }
      if (area.score >= 86) reasons.push(`Popular ${area.label}`);
      else if (area.label) reasons.push(area.label);
      if (live.reason) reasons.push(live.reason);
      if (listing.foreignerOk) reasons.push("Foreigners welcome");
      else if (!photo && listing.photos && listing.photos.length >= 5) {
        reasons.push("Lots of photos");
      }

      return {
        listing,
        score,
        reasons: [...new Set(reasons)].slice(0, 3),
        neighborhood: area.label,
        valueLabel,
        photoLabel,
      };
    })
    .sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id));
}
