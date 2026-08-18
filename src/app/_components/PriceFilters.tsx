"use client";

import { formatKrwFromManwon } from "~/lib/listings/copy";
import { describePriceFilter, parseOptionalManwon, type PriceFilter } from "~/lib/listings/price";

function ManwonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (next?: number) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        placeholder="any"
        value={value ?? ""}
        onChange={(event) => onChange(parseOptionalManwon(event.target.value))}
        className="search-input mt-0.5 w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-sky-400"
      />
      {value != null ? (
        <span className="mt-0.5 block text-[10px] text-slate-500">
          {formatKrwFromManwon(value)}
        </span>
      ) : (
        <span className="mt-0.5 block text-[10px] text-transparent">0</span>
      )}
    </label>
  );
}

export function PriceFilters({
  value,
  onChange,
}: {
  value: PriceFilter;
  onChange: (next: PriceFilter) => void;
}) {
  const hint = describePriceFilter(value);
  return (
    <div className="mt-1.5">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <ManwonField
          label="Min deposit"
          value={value.minDeposit}
          onChange={(minDeposit) => onChange({ ...value, minDeposit })}
        />
        <ManwonField
          label="Max deposit"
          value={value.maxDeposit}
          onChange={(maxDeposit) => onChange({ ...value, maxDeposit })}
        />
        <ManwonField
          label="Min monthly"
          value={value.minRent}
          onChange={(minRent) => onChange({ ...value, minRent })}
        />
        <ManwonField
          label="Max monthly"
          value={value.maxRent}
          onChange={(maxRent) => onChange({ ...value, maxRent })}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>만원 · 1000 = ₩10 million, 80 = ₩800,000 / month</span>
        {hint ? (
          <button
            type="button"
            onClick={() => onChange({})}
            className="shrink-0 text-slate-400 hover:text-white"
          >
            Clear prices
          </button>
        ) : null}
      </div>
    </div>
  );
}
