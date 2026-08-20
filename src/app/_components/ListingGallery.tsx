"use client";

import { useEffect, useRef, useState } from "react";
import { preloadListingPhotos, uniquePhotoUrls } from "~/lib/listings/photo";

export function ListingGallery({
  urls,
  alt,
  layout = "sheet",
}: {
  urls: Array<string | undefined>;
  alt: string;
  layout?: "sheet" | "page";
}) {
  const photos = uniquePhotoUrls(urls, 800);
  const photoKey = photos.join("|");
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const visible = photos.filter((src) => !failed.has(src));
  const visibleKey = visible.join("|");
  const current = visible[Math.min(index, Math.max(visible.length - 1, 0))];

  useEffect(() => {
    setIndex(0);
    setFailed(new Set());
  }, [photoKey]);

  useEffect(() => {
    return preloadListingPhotos(visibleKey ? visibleKey.split("|") : []);
  }, [visibleKey]);

  useEffect(() => {
    const node = frame.current;
    if (!node || visible.length < 2) return;

    const onMove = (event: TouchEvent) => {
      const origin = start.current;
      const touch = event.touches[0];
      if (!origin || !touch) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault();
      }
    };
    node.addEventListener("touchmove", onMove, { passive: false });
    return () => node.removeEventListener("touchmove", onMove);
  }, [visible.length]);

  const go = (delta: number) => {
    if (visible.length < 2) return;
    setIndex((currentIndex) => (currentIndex + delta + visible.length) % visible.length);
  };

  useEffect(() => {
    if (layout !== "page" || visible.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setIndex(
          (currentIndex) => (currentIndex - 1 + visible.length) % visible.length,
        );
      }
      if (event.key === "ArrowRight") {
        setIndex((currentIndex) => (currentIndex + 1) % visible.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, visible.length]);

  if (!current) return null;

  return (
    <div className={layout === "page" ? "relative" : "relative px-4"}>
      <div
        ref={frame}
        className="relative touch-pan-y overflow-hidden rounded-xl"
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const origin = start.current;
          start.current = null;
          if (!origin) return;
          const dx = event.clientX - origin.x;
          if (dx < -40) go(1);
          if (dx > 40) go(-1);
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          start.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const origin = start.current;
          const touch = event.changedTouches[0];
          start.current = null;
          if (!origin || !touch) return;
          const dx = touch.clientX - origin.x;
          if (dx < -40) go(1);
          if (dx > 40) go(-1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={alt}
          draggable={false}
          className={
            layout === "page"
              ? "h-72 w-full select-none object-cover sm:h-[28rem]"
              : "h-52 w-full select-none object-cover"
          }
          onError={() => {
            setFailed((currentFailed) => new Set(currentFailed).add(current));
            setIndex((currentIndex) => Math.min(currentIndex, Math.max(visible.length - 2, 0)));
          }}
        />
        {visible.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 px-2 py-1 text-sm"
              onClick={() => go(-1)}
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 px-2 py-1 text-sm"
              onClick={() => go(1)}
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
      {visible.length > 1 ? (
        <p className="mt-1 text-center text-[11px] text-slate-400">
          {Math.min(index + 1, visible.length)} / {visible.length}
          {layout === "page" ? " · arrows or swipe" : " · swipe for more"}
        </p>
      ) : null}
      {layout === "page" && visible.length > 1 ? (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {visible.map((src, photoIndex) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(photoIndex)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border ${
                photoIndex === Math.min(index, visible.length - 1)
                  ? "border-sky-400"
                  : "border-white/10"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
