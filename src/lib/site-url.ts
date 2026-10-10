export const PRODUCTION_SITE_URL = "https://ziggybang.vercel.app";

type Env = Record<string, string | undefined>;

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function toOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(withProtocol(value)).origin;
  } catch {
    return null;
  }
}

/**
 * Stable public origin used for canonical, openGraph and metadataBase.
 * NEXT_PUBLIC_SITE_URL wins, otherwise always the production domain, so
 * preview deployments never compete with production in search.
 */
export function canonicalSiteUrl(env: Env = process.env): string {
  return toOrigin(env.NEXT_PUBLIC_SITE_URL) ?? PRODUCTION_SITE_URL;
}

/**
 * Origin for robots/sitemap. Precedence: NEXT_PUBLIC_SITE_URL, then the fixed
 * production URL when VERCEL_ENV is "production" (never the per-deployment
 * VERCEL_URL), then VERCEL_URL for preview deployments, then localhost (dev).
 */
export function siteUrl(env: Env = process.env): string {
  const explicit = toOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit;
  if (env.VERCEL_ENV === "production") return PRODUCTION_SITE_URL;
  const preview = toOrigin(env.VERCEL_URL);
  if (preview) return preview;
  return "http://localhost:3000";
}
