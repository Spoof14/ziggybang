import { describe, expect, it } from "vitest";
import { canonicalSiteUrl, PRODUCTION_SITE_URL, siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("uses localhost in dev", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
  it("prefers NEXT_PUBLIC_SITE_URL over everything", () => {
    expect(
      siteUrl({
        NEXT_PUBLIC_SITE_URL: "https://example.com/",
        VERCEL_URL: "x.vercel.app",
        VERCEL_ENV: "production",
      }),
    ).toBe("https://example.com");
  });
  it("ignores an invalid NEXT_PUBLIC_SITE_URL", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "not a url ::", VERCEL_ENV: "production" })).toBe(
      PRODUCTION_SITE_URL,
    );
  });
  it("uses the fixed production URL in production, not VERCEL_URL", () => {
    expect(
      siteUrl({
        VERCEL_ENV: "production",
        VERCEL_URL: "ziggybang-abc123-spoof14s-projects.vercel.app",
      }),
    ).toBe(PRODUCTION_SITE_URL);
  });
  it("uses VERCEL_URL (with https) for previews", () => {
    expect(
      siteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "ziggybang-git-x.vercel.app" }),
    ).toBe("https://ziggybang-git-x.vercel.app");
  });
});

describe("canonicalSiteUrl", () => {
  it("is production even on previews", () => {
    expect(
      canonicalSiteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" }),
    ).toBe(PRODUCTION_SITE_URL);
    expect(canonicalSiteUrl({})).toBe(PRODUCTION_SITE_URL);
  });
  it("honors NEXT_PUBLIC_SITE_URL", () => {
    expect(canonicalSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.com" })).toBe(
      "https://example.com",
    );
  });
});
