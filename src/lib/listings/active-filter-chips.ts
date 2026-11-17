import { type Lang, t } from "~/lib/i18n";
import {
  ageFilterText,
  type AgeFilter,
} from "./age";
import { areaBucketLabel, type AreaBucketId } from "./area";
import {
  propertyTypeText,
  salesTypeFilterText,
  sourceText,
} from "./copy";
import { describePriceFilter } from "./price";
import { describeBuildingAgeFilter } from "./building-age";
import { floorFilterText, type FloorFilter } from "./floor";
import { isAllPropertyTypes, isDefaultRentSales } from "./filter";
import { type PriceFilter } from "./price";
import { type PropertyType, type SalesType, type Source } from "./types";

export type ActiveFilterChip = {
  id: string;
  label: string;
};

const ALL_SOURCES: Source[] = ["zigbang", "naver", "peterpan"];

export function activeFilterChips(
  input: {
    sources: Source[];
    propertyTypes: PropertyType[];
    salesTypes: SalesType[];
    areaBucketIds: AreaBucketId[];
    query: string;
    foreignerOk?: boolean;
    hasPhotos?: boolean;
    floorFilter?: FloorFilter;
    ageFilter?: AgeFilter;
    maxBuildingAge?: number;
  } & PriceFilter,
  lang: Lang,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (input.sources.length && input.sources.length < ALL_SOURCES.length) {
    chips.push({
      id: "sources",
      label: input.sources.map((s) => sourceText(lang, s)).join(" · "),
    });
  }
  if (!isAllPropertyTypes(input.propertyTypes)) {
    chips.push({
      id: "propertyTypes",
      label: input.propertyTypes.map((type) => propertyTypeText(lang, type)).join(" · "),
    });
  }
  if (input.salesTypes.length && !isDefaultRentSales(input.salesTypes)) {
    chips.push({
      id: "salesTypes",
      label: input.salesTypes.map((type) => salesTypeFilterText(lang, type)).join(" · "),
    });
  }
  for (const bucket of input.areaBucketIds) {
    chips.push({ id: `area:${bucket}`, label: areaBucketLabel(lang, bucket) });
  }
  const price = describePriceFilter(input, lang);
  if (price) chips.push({ id: "price", label: price });
  const built = describeBuildingAgeFilter(input.maxBuildingAge, lang);
  if (built) chips.push({ id: "buildingAge", label: built });
  if (input.foreignerOk) chips.push({ id: "foreignerOk", label: t(lang, "chip.foreigner") });
  if (input.hasPhotos) chips.push({ id: "hasPhotos", label: t(lang, "chip.photos") });
  if (input.floorFilter) {
    chips.push({ id: "floorFilter", label: floorFilterText(lang, input.floorFilter) });
  }
  if (input.ageFilter) {
    chips.push({ id: "ageFilter", label: ageFilterText(lang, input.ageFilter) });
  }
  if (input.query.trim()) {
    chips.push({ id: "query", label: input.query.trim() });
  }
  return chips;
}