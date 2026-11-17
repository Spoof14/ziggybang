"use client";

import { useEffect, useState } from "react";
import { isDeskSize, isDeskViewport } from "~/lib/geo/layout";

/** True when the side-panel desktop layout is active (matches Tailwind `desk:`). */
export function useDeskLayout(): boolean {
  const [desk, setDesk] = useState(
    () => typeof window !== "undefined" && isDeskViewport(),
  );
  useEffect(() => {
    const update = () => setDesk(isDeskSize(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return desk;
}