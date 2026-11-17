import type { MetadataRoute } from "next";

import { canonicalSiteUrl } from "~/lib/site-url";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ziggybang",
    short_name: "Ziggybang",
    description:
      "English map of Zigbang, Peterpan, and Naver Korea rentals, with KRW prices and jeonse vs monthly rent explained.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    orientation: "portrait",
    background_color: "#020617",
    theme_color: "#020617",
    id: canonicalSiteUrl(),
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}