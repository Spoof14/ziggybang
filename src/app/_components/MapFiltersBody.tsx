"use client";

import { type Dispatch, type SetStateAction } from "react";
import { formatCount } from "~/lib/i18n";
import { useI18n } from "~/lib/i18n/react";
import {
  ageFilterText,
  ageFilterTitle,
  ageFilters,
  type AgeFilter,
} from "~/lib/listings/age";
import {
  areaBuckets,
  areaBucketHint,
  areaBucketLabel,
  type AreaBucketId,
} from "~/lib/listings/area";
import {
  propertyTypeText,
  salesTypeFilterText,
  sourceText,
} from "~/lib/listings/copy";
import { floorFilterText, floorFilters, type FloorFilter } from "~/lib/listings/floor";
import { type PriceFilter } from "~/lib/listings/price";
import {
  type PropertyType,
  type SalesType,
  type Source,
} from "~/lib/listings/types";
import { BuildingAgeSlider } from "./BuildingAgeSlider";
import { PriceFilters } from "./PriceFilters";
import { type CircleFilter, type LatLng, formatRadius } from "~/lib/geo/shape";
import { type Bounds } from "~/lib/listings/types";

const ALL_SOURCES: Source[] = ["zigbang", "naver", "peterpan"];
const ALL_TYPES: PropertyType[] = ["oneroom", "villa", "officetel", "apartment"];
const ALL_SALES: SalesType[] = ["jeonse", "wolse", "sale"];
const TYPE_CHIP_ON: Record<PropertyType, string> = {
  oneroom: "bg-orange-500 text-slate-950",
  villa: "bg-amber-300 text-slate-950",
  officetel: "bg-violet-300 text-slate-950",
  apartment: "bg-sky-400 text-slate-950",
};

function toggleValue<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function boundsCenter(bounds: Bounds): LatLng {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
}

const chip =
  "inline-flex min-h-10 items-center rounded-full px-3 py-1.5 text-xs sm:text-sm";

export function MapFiltersBody({
  sources,
  setSources,
  propertyTypes,
  setPropertyTypes,
  salesTypes,
  setSalesTypes,
  foreignerOk,
  setForeignerOk,
  hasPhotos,
  setHasPhotos,
  floorFilter,
  setFloorFilter,
  ageFilter,
  setAgeFilter,
  areaBucketIds,
  setAreaBucketIds,
  priceFilter,
  onPriceChange,
  maxBuildingAge,
  setMaxBuildingAge,
  filterSummary,
  visibleHomeCount,
  clearChipFilters,
  tool,
  setTool,
  circle,
  polygon,
  draftPoints,
  setDraftPoints,
  setPolygon,
  setManualCircle,
  bounds,
  radiusM,
  setRadiusM,
  finishDraw,
  clearArea,
}: {
  sources: Source[];
  setSources: Dispatch<SetStateAction<Source[]>>;
  propertyTypes: PropertyType[];
  setPropertyTypes: Dispatch<SetStateAction<PropertyType[]>>;
  salesTypes: SalesType[];
  setSalesTypes: Dispatch<SetStateAction<SalesType[]>>;
  foreignerOk: boolean;
  setForeignerOk: Dispatch<SetStateAction<boolean>>;
  hasPhotos: boolean;
  setHasPhotos: Dispatch<SetStateAction<boolean>>;
  floorFilter?: FloorFilter;
  setFloorFilter: Dispatch<SetStateAction<FloorFilter | undefined>>;
  ageFilter?: AgeFilter;
  setAgeFilter: Dispatch<SetStateAction<AgeFilter | undefined>>;
  areaBucketIds: AreaBucketId[];
  setAreaBucketIds: Dispatch<SetStateAction<AreaBucketId[]>>;
  priceFilter: PriceFilter;
  onPriceChange: (next: PriceFilter) => void;
  maxBuildingAge?: number;
  setMaxBuildingAge: Dispatch<SetStateAction<number | undefined>>;
  filterSummary: string | null;
  visibleHomeCount: number;
  clearChipFilters: () => void;
  tool: "pan" | "radius" | "draw";
  setTool: Dispatch<SetStateAction<"pan" | "radius" | "draw">>;
  circle: CircleFilter | null;
  polygon: LatLng[] | null;
  draftPoints: LatLng[];
  setDraftPoints: Dispatch<SetStateAction<LatLng[]>>;
  setPolygon: Dispatch<SetStateAction<LatLng[] | null>>;
  setManualCircle: Dispatch<SetStateAction<CircleFilter | null>>;
  bounds: Bounds;
  radiusM: number;
  setRadiusM: Dispatch<SetStateAction<number>>;
  finishDraw: () => void;
  clearArea: () => void;
}) {
  const { lang, t } = useI18n();
  return (
  <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("filters.section.sources")}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ALL_SOURCES.map((source) => (
              <button
                key={source}
                type="button"
                aria-pressed={sources.includes(source)}
                onClick={() =>
                  setSources((current) => {
                    const next = toggleValue(current, source);
                    return next.length ? next : current;
                  })
                }
                className={`${chip} font-medium ${
                  sources.includes(source)
                    ? source === "naver"
                      ? "bg-emerald-500 text-slate-950"
                      : source === "peterpan"
                        ? "bg-amber-400 text-slate-950"
                        : "bg-orange-500 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {sourceText(lang, source)}
              </button>
            ))}
            {ALL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={propertyTypes.includes(type)}
                onClick={() =>
                  setPropertyTypes((current) => {
                    const next = toggleValue(current, type);
                    return next.length ? next : current;
                  })
                }
                className={`${chip} ${
                  propertyTypes.includes(type)
                    ? TYPE_CHIP_ON[type]
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {propertyTypeText(lang, type)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("filters.section.deal")}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ALL_SALES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={salesTypes.includes(type)}
                onClick={() =>
                  setSalesTypes((current) => {
                    const next = toggleValue(current, type);
                    return next.length ? next : current;
                  })
                }
                className={`${chip} ${
                  salesTypes.includes(type)
                    ? "bg-sky-400 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {salesTypeFilterText(lang, type)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={foreignerOk}
              onClick={() => setForeignerOk((current) => !current)}
              title={t("chip.foreigner.title")}
              className={`${chip} ${
                foreignerOk
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              {t("chip.foreigner")}
            </button>
            <button
              type="button"
              aria-pressed={hasPhotos}
              onClick={() => setHasPhotos((current) => !current)}
              title={t("chip.photos.title")}
              className={`${chip} ${
                hasPhotos
                  ? "bg-sky-400 text-slate-950"
                  : "bg-white/10 text-slate-300"
              }`}
            >
              {t("chip.photos")}
            </button>
            {floorFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={floorFilter === filter}
                onClick={() =>
                  setFloorFilter((current) => (current === filter ? undefined : filter))
                }
                className={`${chip} ${
                  floorFilter === filter
                    ? "bg-amber-300 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {floorFilterText(lang, filter)}
              </button>
            ))}
            {ageFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={ageFilter === filter}
                title={ageFilterTitle(lang, filter)}
                onClick={() =>
                  setAgeFilter((current) => (current === filter ? undefined : filter))
                }
                className={`${chip} ${
                  ageFilter === filter
                    ? filter === "week"
                      ? "bg-emerald-400 text-slate-950"
                      : "bg-amber-300 text-slate-950"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {ageFilterText(lang, filter)}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("filters.section.area")}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {areaBuckets.map((bucket) => {
              const active = areaBucketIds.includes(bucket.id);
              return (
                <button
                  key={bucket.id}
                  type="button"
                  aria-pressed={active}
                  title={areaBucketHint(lang, bucket.id)}
                  onClick={() =>
                    setAreaBucketIds((current) => toggleValue(current, bucket.id))
                  }
                  className={`${chip} ${
                    active ? "bg-violet-400 text-slate-950" : "bg-white/10 text-slate-300"
                  }`}
                >
                  {areaBucketLabel(lang, bucket.id)}
                </button>
              );
            })}
          </div>

          <PriceFilters value={priceFilter} onChange={onPriceChange} />
          <BuildingAgeSlider
            maxBuildingAge={maxBuildingAge}
            onChange={setMaxBuildingAge}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] text-violet-200">
              {filterSummary ?? t("summary.none")}
              {visibleHomeCount
                ? t("summary.onMap", { n: formatCount(visibleHomeCount, lang) })
                : ""}
            </p>
            <button
              type="button"
              onClick={clearChipFilters}
              className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/20"
            >
              {t("summary.clear")}
            </button>
          </div>

          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("filters.section.mapTools")}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(["pan", "radius", "draw"] as const).map((nextTool) => (
              <button
                key={nextTool}
                type="button"
                aria-pressed={tool === nextTool}
                onClick={() => setTool(nextTool)}
                className={`${chip} capitalize ${
                  tool === nextTool ? "bg-sky-400 text-slate-950" : "bg-white/10 text-slate-300"
                }`}
              >
                {t(`tool.${nextTool}`)}
              </button>
            ))}
            {tool === "radius" ? (
              <button
                type="button"
                onClick={() => {
                  setPolygon(null);
                  setDraftPoints([]);
                  setManualCircle({ ...boundsCenter(bounds), radiusM });
                }}
                className={`${chip} bg-white/10 text-slate-300`}
              >
                {t("tool.useCenter")}
              </button>
            ) : null}
            {draftPoints.length ? (
              <button
                type="button"
                onClick={() => setDraftPoints((current) => current.slice(0, -1))}
                className={`${chip} bg-white/10 text-slate-300`}
              >
                {t("tool.undo")}
              </button>
            ) : null}
            {draftPoints.length >= 3 ? (
              <button
                type="button"
                onClick={finishDraw}
                className={`${chip} bg-emerald-400 text-slate-950`}
              >
                {t("tool.finish")}
              </button>
            ) : null}
            {Boolean(circle ?? polygon) || draftPoints.length > 0 ? (
              <button
                type="button"
                onClick={clearArea}
                className={`${chip} bg-white/10 text-slate-300`}
              >
                {t("tool.clear")}
              </button>
            ) : null}
          </div>

          {tool === "radius" || circle ? (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
              {t("tool.radius")}
              <input
                type="range"
                min={250}
                max={3000}
                step={50}
                value={radiusM}
                onChange={(event) => setRadiusM(Number(event.target.value))}
                className="min-h-10 flex-1"
              />
              <span className="w-14 text-right text-white">{formatRadius(radiusM)}</span>
            </label>
          ) : null}

          {tool === "draw" ? (
            <p className="mt-1.5 text-[11px] text-slate-400">{t("tool.drawHelp")}</p>
          ) : null}
          {tool === "radius" && !circle ? (
            <p className="mt-1.5 text-[11px] text-slate-400">{t("tool.radiusHelp")}</p>
          ) : null}
  </>
  );
}