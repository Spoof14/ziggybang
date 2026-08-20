"use client";

import {
  MAX_BUILDING_AGE_ANY,
  MAX_BUILDING_AGE_MIN,
  describeBuildingAgeFilter,
} from "~/lib/listings/building-age";

export function BuildingAgeSlider({
  maxBuildingAge,
  onChange,
}: {
  maxBuildingAge?: number;
  onChange: (maxBuildingAge?: number) => void;
}) {
  const sliderValue = maxBuildingAge ?? MAX_BUILDING_AGE_ANY;
  const label = describeBuildingAgeFilter(maxBuildingAge) ?? "Any age";

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          Building age
        </span>
        <span className="text-right text-[11px] text-slate-300">{label}</span>
      </div>
      <input
        type="range"
        min={MAX_BUILDING_AGE_MIN}
        max={MAX_BUILDING_AGE_ANY}
        step={5}
        value={sliderValue}
        onChange={(event) => {
          const years = Number(event.target.value);
          if (!Number.isFinite(years) || years >= MAX_BUILDING_AGE_ANY) {
            onChange(undefined);
            return;
          }
          onChange(years);
        }}
        className="mt-2 h-1.5 w-full cursor-pointer accent-sky-400"
        aria-label="Maximum building age in years"
      />
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>Up to {MAX_BUILDING_AGE_MIN}y</span>
        {maxBuildingAge ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-slate-400 hover:text-white"
          >
            Clear
          </button>
        ) : (
          <span />
        )}
        <span>Any age</span>
      </div>
    </div>
  );
}
