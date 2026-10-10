"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { activeSlideIndex, stepSlide, visibleSlideRange, type AskPick } from "~/lib/listings/ask-picks";
import { areaLabel } from "~/lib/listings/ask-quality";
import { buildingAgeYears } from "~/lib/listings/building-age";
import { formatFloor, propertyTypeLabel, salesTypeFilterLabel, sourceLabel } from "~/lib/listings/copy";
import { englishAddressLine } from "~/lib/listings/english";
import { toPyeong } from "~/lib/listings/area";
import { type MapListing } from "~/lib/listings/types";
import { ListingPageLink } from "./ListingPageLink";
import { ListingPhoto } from "./ListingPhoto";
import { ListingPrice } from "./ListingPrice";

function builtLabel(listing: MapListing): string | null {
  const age = buildingAgeYears(listing.approveDate);
  const year = (listing.approveDate ?? "").replace(/\D/g, "").slice(0, 4);
  if (age == null || !/^\d{4}$/.test(year)) return null;
  return age <= 0 ? `Built ${year} · new` : `Built ${year} · ${age} yr${age === 1 ? "" : "s"} old`;
}

function distanceLabel(meters?: number): string | null {
  if (meters == null) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km away` : `${Math.max(10, Math.round(meters / 10) * 10)} m away`;
}

export function AskPickCard({
  pick,
  total,
  saved,
  highlighted,
  onToggleSave,
  onShowOnMap,
}: {
  pick: AskPick;
  total: number;
  saved: boolean;
  highlighted: boolean;
  onToggleSave: (listing: MapListing) => void;
  onShowOnMap: (pick: AskPick) => void;
}) {
  const { listing } = pick;
  const facts = [
    listing.areaM2 ? `${listing.areaM2} m² · ${toPyeong(listing.areaM2).toFixed(1)} pyeong` : null,
    formatFloor(listing.floor),
    builtLabel(listing),
  ].filter(Boolean);
  const where = areaLabel(listing) ?? englishAddressLine(listing);
  const kind = [
    propertyTypeLabel[listing.propertyType],
    listing.salesType ? salesTypeFilterLabel[listing.salesType] : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      role="group"
      aria-roledescription="slide"
      aria-label={`${pick.rank} of ${total}: ${kind}${where ? `, ${where}` : ""}`}
      aria-current={highlighted ? "true" : undefined}
      data-pick-id={listing.id}
      className={`flex w-[85%] shrink-0 snap-start sm:w-[min(16.5rem,80%)] flex-col overflow-hidden rounded-2xl border bg-slate-900 text-slate-100 shadow-lg ${
        highlighted ? "border-sky-400 ring-1 ring-sky-400" : "border-white/10"
      }`}
    >
      <div className="relative">
        <ListingPhoto
          url={listing.thumbnail ?? listing.photos?.[0]}
          alt={listing.title ? `Photo: ${listing.title}` : `${kind} photo`}
          width={480}
          className="h-32 w-full object-cover"
        />
        <span className="absolute left-2 top-2 rounded-full bg-slate-950/85 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
          #{pick.rank}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-slate-950/85 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
          {sourceLabel[listing.source]}
        </span>
        <button
          type="button"
          onClick={() => onToggleSave(listing)}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save listing"}
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/85 text-base text-rose-300 hover:bg-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-2.5">
        <p className="text-[10px] uppercase tracking-wide text-slate-400">{kind}</p>
        <ListingPrice listing={listing} className="text-sm font-semibold leading-snug text-slate-50" />
        {facts.length ? <p className="text-[11px] leading-snug text-slate-300">{facts.join(" · ")}</p> : null}
        <p className="text-[11px] leading-snug text-slate-400">
          {[where, distanceLabel(pick.distanceM)].filter(Boolean).join(" · ")}
        </p>
        <p
          className={`mt-0.5 rounded-lg px-2 py-1.5 text-xs leading-snug ${
            pick.reasonSource === "ai" ? "bg-sky-400/10 text-sky-100" : "bg-white/5 text-slate-300"
          }`}
        >
          <span className="sr-only">Why this one: </span>
          {pick.reason}
          {pick.similar ? <span className="ml-1 whitespace-nowrap text-slate-400">· +{pick.similar} similar</span> : null}
        </p>
        <div className="mt-auto flex gap-2 pt-2">
          <ListingPageLink
            listing={listing}
            className="flex-1 rounded-full bg-sky-400 px-3 py-1.5 text-center text-xs font-medium text-slate-950 hover:bg-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            View
            <span className="sr-only"> listing {pick.rank}</span>
          </ListingPageLink>
          <button
            type="button"
            onClick={() => onShowOnMap(pick)}
            className="flex-1 rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            Show on map
            <span className="sr-only"> for listing {pick.rank}</span>
          </button>
        </div>
      </div>
    </li>
  );
}

export function AskCarousel({
  picks,
  savedIds,
  highlightedId,
  onToggleSave,
  onShowOnMap,
}: {
  picks: AskPick[];
  savedIds: ReadonlySet<string>;
  highlightedId?: string;
  onToggleSave: (listing: MapListing) => void;
  onShowOnMap: (pick: AskPick) => void;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [range, setRange] = useState({ first: 0, last: 0 });
  const [edges, setEdges] = useState({ start: true, end: false });
  const frame = useRef(0);

  const stride = useCallback(() => {
    const items = scroller.current?.children;
    if (!items || items.length < 2) return (items?.[0] as HTMLElement | undefined)?.offsetWidth ?? 1;
    return (items[1] as HTMLElement).offsetLeft - (items[0] as HTMLElement).offsetLeft;
  }, []);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setActive(activeSlideIndex(el.scrollLeft, stride(), picks.length, atEnd));
    setRange(visibleSlideRange(el.scrollLeft, el.clientWidth, stride(), picks.length, (el.children[0] as HTMLElement | undefined)?.offsetWidth));
    setEdges({ start: el.scrollLeft <= 2, end: atEnd });
  }, [picks.length, stride]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  // Jump back to the first card for a new result set.
  const firstId = picks[0]?.listing.id;
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
    measure();
  }, [firstId, measure]);

  function goTo(index: number) {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const target = stepSlide(index, 0, picks.length);
    el.scrollTo({ left: target * stride(), behavior: reduce ? "auto" : "smooth" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    // Only when the carousel itself has focus; arrows inside a card's buttons keep their meaning.
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight") goTo(stepSlide(active, 1, picks.length));
    else if (event.key === "ArrowLeft") goTo(stepSlide(active, -1, picks.length));
    else if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(picks.length - 1);
    else return;
    event.preventDefault();
  }

  const arrow =
    "flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-base text-slate-100 hover:bg-white/20 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400";

  return (
    <section role="region" aria-roledescription="carousel" aria-label={`Top ${picks.length} picks`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400" aria-live="polite">
          {range.last > range.first
            ? `Showing ${range.first + 1}–${range.last + 1} of ${picks.length}`
            : `Pick ${Math.min(active + 1, picks.length)} of ${picks.length}`}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={arrow}
            aria-label="Previous pick"
            disabled={edges.start}
            onClick={() => goTo(stepSlide(active, -1, picks.length))}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className={arrow}
            aria-label="Next pick"
            disabled={edges.end}
            onClick={() => goTo(stepSlide(active, 1, picks.length))}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <ul
        ref={scroller}
        tabIndex={0}
        aria-label="Picks. Use the left and right arrow keys to move between them."
        onKeyDown={onKeyDown}
        onScroll={() => {
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(measure);
        }}
        className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        style={{ scrollbarWidth: "none", overscrollBehaviorX: "contain" }}
      >
        {picks.map((pick) => (
          <AskPickCard
            key={pick.listing.id}
            pick={pick}
            total={picks.length}
            saved={savedIds.has(pick.listing.id)}
            highlighted={highlightedId === pick.listing.id}
            onToggleSave={onToggleSave}
            onShowOnMap={onShowOnMap}
          />
        ))}
      </ul>
    </section>
  );
}
