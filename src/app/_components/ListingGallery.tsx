"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const largePhotos = uniquePhotoUrls(urls, 1600);
  const photoKey = photos.join("|");
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const ignoreClick = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const visible = photos.filter((src) => !failed.has(src));
  const visibleKey = visible.join("|");
  const currentIndex = Math.min(index, Math.max(visible.length - 1, 0));
  const current = visible[currentIndex];
  const currentLarge = largePhotos[photos.indexOf(current ?? "")] ?? current;

  useEffect(() => {
    setIndex(0);
    setFailed(new Set());
    setLightbox(false);
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

  const finishSwipe = (dx: number) => {
    if (dx < -40) {
      ignoreClick.current = true;
      go(1);
      return true;
    }
    if (dx > 40) {
      ignoreClick.current = true;
      go(-1);
      return true;
    }
    return false;
  };

  const openLightbox = () => {
    if (ignoreClick.current) {
      ignoreClick.current = false;
      return;
    }
    setLightbox(true);
  };

  useEffect(() => {
    if (layout !== "page" || lightbox || visible.length < 2) return;
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
  }, [layout, lightbox, visible.length]);

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
          finishSwipe(event.clientX - origin.x);
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
          finishSwipe(touch.clientX - origin.x);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={alt}
          draggable={false}
          className={
            layout === "page"
              ? "h-72 w-full cursor-zoom-in select-none bg-slate-950 object-contain sm:h-[28rem]"
              : "h-52 w-full cursor-zoom-in select-none bg-slate-950 object-contain"
          }
          onClick={openLightbox}
          onError={() => {
            setFailed((currentFailed) => new Set(currentFailed).add(current));
            setIndex((currentIndex) => Math.min(currentIndex, Math.max(visible.length - 2, 0)));
          }}
        />
        <button
          type="button"
          className="absolute bottom-2 right-2 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-100 hover:bg-slate-900"
          onClick={(event) => {
            event.stopPropagation();
            ignoreClick.current = false;
            setLightbox(true);
          }}
          aria-label="View photo fullscreen"
        >
          Fullscreen
        </button>
        {visible.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 px-2 py-1 text-sm"
              onClick={(event) => {
                event.stopPropagation();
                go(-1);
              }}
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 px-2 py-1 text-sm"
              onClick={(event) => {
                event.stopPropagation();
                go(1);
              }}
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
      {visible.length > 1 ? (
        <p className="mt-1 text-center text-[11px] text-slate-400">
          {currentIndex + 1} / {visible.length}
          {layout === "page" ? " · tap to enlarge · arrows or swipe" : " · tap to enlarge · swipe"}
        </p>
      ) : (
        <p className="mt-1 text-center text-[11px] text-slate-400">Tap to enlarge</p>
      )}
      {layout === "page" && visible.length > 1 ? (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {visible.map((src, photoIndex) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(photoIndex)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border ${
                photoIndex === currentIndex
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
      {lightbox && currentLarge ? (
        <PhotoLightbox
          src={currentLarge}
          alt={alt}
          index={currentIndex}
          total={visible.length}
          onClose={() => setLightbox(false)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
        />
      ) : null}
    </div>
  );
}

function PhotoLightbox({
  src,
  alt,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: {
  src: string;
  alt: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, onNext, onPrev]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex flex-col bg-slate-950/95 text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen photo"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm text-slate-300">
          {total > 1 ? `${index + 1} / ${total}` : "Photo"}
        </p>
        <button
          type="button"
          autoFocus
          className="rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          Close
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const origin = start.current;
          start.current = null;
          if (!origin) return;
          const dx = event.clientX - origin.x;
          if (dx < -40) onNext();
          if (dx > 40) onPrev();
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
        />
        {total > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/80 px-3 py-2 text-lg hover:bg-slate-900"
              onClick={onPrev}
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/80 px-3 py-2 text-lg hover:bg-slate-900"
              onClick={onNext}
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
