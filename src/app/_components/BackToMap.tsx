"use client";

import { useRouter } from "next/navigation";
import { cameFromApp } from "~/lib/listings/path";

export function BackToMap({
  href,
  className,
  children = "Back to map",
}: {
  href: string;
  className?: string;
  children?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (cameFromApp()) {
          router.back();
          return;
        }
        router.push(href);
      }}
      className={className}
    >
      {children}
    </button>
  );
}
