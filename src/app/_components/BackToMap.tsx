"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "~/lib/i18n/react";
import { cameFromApp } from "~/lib/listings/path";

export function BackToMap({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();

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
      {children ?? t("page.backToMap")}
    </button>
  );
}
