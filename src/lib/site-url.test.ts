import { describe, expect, it } from "vitest";
import { PRODUCTION_SITE_URL, siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("falls back to production", () => {
    expect(siteUrl({})).toBe(PRODUCTION_SITE_URL);
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "not a url ::" })).toBe(PRODUCTION_SITE_URL);
  });
  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    expect(
      siteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.com/", VERCEL_URL: "x.vercel.app" }),
    ).toBe("https://example.com");
  });
  it("adds https to VERCEL_URL", () => {
    expect(siteUrl({ VERCEL_URL: "ziggybang-git-x.vercel.app" })).toBe(
      "https://ziggybang-git-x.vercel.app",
    );
  });
});
