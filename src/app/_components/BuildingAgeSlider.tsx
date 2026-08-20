"use client";

import {
  BUILT_YEAR_MIN,
  builtYearMax,
  describeBuiltYearFilter,
} from "~/lib/listings/building-age";

export function BuildingAgeSlider({
  minBuiltYear,
  onChange,
}: {
  minBuiltYear?: number;
  onChange: (minBuiltYear?: number) => void;
}) {
  const maxYear = builtYearMax();
  const sliderValue = minBuiltYear ?? BUILT_YEAR_MIN;
  const label = describeBuiltYearFilter(minBuiltYear) ?? "Any age";

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
        min={BUILT_YEAR_MIN}
        max={maxYear}
        step={1}
        value={sliderValue}
        onChange={(event) => {
          const year = Number(event.target.value);
          if (!Number.isFinite(year) || year <= BUILT_YEAR_MIN) {
            onChange(undefined);
            return;
          }
          onChange(year);
        }}
        className="mt-2 h-1.5 w-full cursor-pointer accent-sky-400"
        aria-label="Minimum building year"
      />
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>Older ({BUILT_YEAR_MIN})</span>
        {minBuiltYear ? (
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
        <span>Newer ({maxYear})</span>
      </div>
    </div>
  );
}
