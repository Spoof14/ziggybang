"use client";

import { sourceLabel } from "~/lib/listings/copy";
import { hasHangul } from "~/lib/listings/foreigner";
import { type Source } from "~/lib/listings/types";
import { api } from "~/trpc/react";

export function LandlordNotes({
  text,
  source,
}: {
  text: string;
  source: Source;
}) {
  const trimmed = text.trim();
  const korean = hasHangul(trimmed);
  const query = api.listings.translateNotes.useQuery(
    { text: trimmed },
    {
      enabled: Boolean(trimmed) && korean,
      retry: false,
      staleTime: 24 * 60 * 60 * 1000,
    },
  );

  if (!trimmed) return null;

  const english = query.data?.english?.trim();
  const translated = query.data?.source === "openai" && Boolean(english);

  return (
    <div>
      <h3 className="text-sm font-semibold text-white">Landlord notes</h3>
      {translated ? (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
            {english}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
              Korean original
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
              {trimmed}
            </p>
          </details>
        </>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
            {trimmed}
          </p>
          {korean && (query.isLoading || query.isFetching) ? (
            <p className="mt-2 text-[11px] text-slate-500">Translating into English…</p>
          ) : korean ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Couldn&apos;t translate automatically. Korean original from{" "}
              {sourceLabel[source]}.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              From {sourceLabel[source]}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
