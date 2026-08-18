"use client";

import { useEffect, useRef, useState } from "react";
import { formatKrwFromManwon } from "~/lib/listings/copy";
import {
  describePriceFilter,
  formatWonInput,
  parseWonToManwon,
  type PriceFilter,
} from "~/lib/listings/price";

function WonField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value?: number;
  onChange: (next?: number) => void;
}) {
  const [draft, setDraft] = useState(formatWonInput(value));
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused.current) setDraft(formatWonInput(value));
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function commit(raw: string) {
    onChange(parseWonToManwon(raw));
  }

  return (
    <label className="min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(nextDraft), 400);
        }}
        onBlur={() => {
          focused.current = false;
          if (timer.current) clearTimeout(timer.current);
          const manwon = parseWonToManwon(draft);
          onChange(manwon);
          setDraft(formatWonInput(manwon));
        }}
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
        <WonField
          label="Min deposit ₩"
          placeholder="5,000,000"
          value={value.minDeposit}
          onChange={(minDeposit) => onChange({ ...value, minDeposit })}
        />
        <WonField
          label="Max deposit ₩"
          placeholder="20,000,000"
          value={value.maxDeposit}
          onChange={(maxDeposit) => onChange({ ...value, maxDeposit })}
        />
        <WonField
          label="Min monthly ₩"
          placeholder="500,000"
          value={value.minRent}
          onChange={(minRent) => onChange({ ...value, minRent })}
        />
        <WonField
          label="Max monthly ₩"
          placeholder="800,000"
          value={value.maxRent}
          onChange={(maxRent) => onChange({ ...value, maxRent })}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>Korean won · monthly often ₩500,000–1,500,000 · deposit ₩5–50 million</span>
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
