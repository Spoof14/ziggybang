export const PRODUCTION_SITE_URL = "https://ziggybang.vercel.app";

function withProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Canonical origin for robots/sitemap. NEXT_PUBLIC_SITE_URL wins, then
 * VERCEL_URL (preview deployments, no protocol), then production.
 */
export function siteUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  const raw = explicit ? explicit : env.VERCEL_URL?.trim();
  if (!raw) return PRODUCTION_SITE_URL;
  try {
    return new URL(withProtocol(raw)).origin;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}
