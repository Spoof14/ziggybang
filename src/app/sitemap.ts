import { type MetadataRoute } from "next";

import { siteUrl } from "~/lib/site-url";

// Listing pages are dynamic and expire quickly, so they are deliberately not
// enumerated; only the stable home entry is listed.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl()}/`,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
