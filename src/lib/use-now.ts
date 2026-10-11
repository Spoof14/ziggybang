"use client";

import { useEffect, useState } from "react";

/** The current time, but only after mount (null while rendering on the server and during hydration). */
export function useNowAfterMount(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  return now;
}
