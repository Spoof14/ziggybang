/**
 * Image proxy allowlist. Only HTTPS, default port, no credentials, and a host
 * that is one of the listing sources' photo CDNs (never an IP literal).
 * realty.asil.kr serves the photos of listings Asil syncs from Naver.
 */
const ALLOWED_HOSTS = [
  "ic.zigbang.com",
  "landthumb-phinf.pstatic.net",
  "ssl.pstatic.net",
  "img.peterpanz.com",
  "peterpanz.com",
  "realty.asil.kr",
];

export function allowedMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** True when the proxy may fetch this URL. */
export function isAllowedMediaUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (url.port === "" || url.port === "443") &&
    allowedMediaHost(url.hostname)
  );
}
