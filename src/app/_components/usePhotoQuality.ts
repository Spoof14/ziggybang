"use client";

import { useEffect, useMemo, useState } from "react";
import { listingPhotoUrl } from "~/lib/listings/photo";
import {
  inspectPhotoUrl,
  type PhotoQuality,
} from "~/lib/listings/photo-quality";

const cache = new Map<string, PhotoQuality>();

export function usePhotoQuality(
  urls: Array<string | undefined>,
  enabled: boolean,
): Record<string, PhotoQuality> {
  const key = urls
    .filter((url): url is string => Boolean(url))
    .slice(0, 36)
    .join("|");
  const unique = useMemo(() => (key ? key.split("|") : []), [key]);
  const [scores, setScores] = useState<Record<string, PhotoQuality>>({});

  useEffect(() => {
    if (!enabled || unique.length === 0) return;
    let cancelled = false;
    const next: Record<string, PhotoQuality> = {};
    const pending: string[] = [];
    for (const url of unique) {
      const hit = cache.get(url);
      if (hit) next[url] = hit;
      else pending.push(url);
    }
    if (Object.keys(next).length) setScores((current) => ({ ...next, ...current }));

    async function run() {
      let index = 0;
      const workers = Array.from({ length: 3 }, async () => {
        while (index < pending.length && !cancelled) {
          const url = pending[index];
          index += 1;
          if (!url) break;
          const src = listingPhotoUrl(url, 320);
          if (!src) continue;
          try {
            const quality = await inspectPhotoUrl(src);
            cache.set(url, quality);
            if (!cancelled) {
              setScores((current) => ({ ...current, [url]: quality }));
            }
          } catch {
            const fallback: PhotoQuality = {
              score: 46,
              summary: "Couldn't read photo",
              likelyFloorplan: false,
              likelyDim: false,
              width: 0,
              height: 0,
            };
            cache.set(url, fallback);
            if (!cancelled) {
              setScores((current) => ({ ...current, [url]: fallback }));
            }
          }
        }
      });
      await Promise.all(workers);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, key, unique]);

  return scores;
}
