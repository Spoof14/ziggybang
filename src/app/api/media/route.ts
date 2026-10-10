import { NextResponse } from "next/server";

/** Naver listing photos are also geo-blocked outside Korea. */
export const preferredRegion = "icn1";
export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set([
  "ic.zigbang.com",
  "landthumb-phinf.pstatic.net",
  "ssl.pstatic.net",
  "img.peterpanz.com",
  "peterpanz.com",
]);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u");
  if (!raw) {
    return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  const host = target.hostname.replace(/^www\./, "");
  if (![...ALLOWED_HOSTS].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  const referer = host.includes("pstatic") || host.includes("naver")
    ? "https://m.land.naver.com/"
    : host.includes("peterpanz")
      ? "https://www.peterpanz.com/"
      : "https://www.zigbang.com/";

  const upstream = await fetchWithRetry(target.toString(), referer);

  if (!upstream || !upstream.ok || !upstream.body) {
    // Non-2xx on purpose: <img onError> in the UI swaps in its own placeholder
    // and CDNs/browsers do not cache the failure for long. The SVG body keeps
    // direct visits readable instead of a bare JSON blob.
    const status = upstream ? 502 : 504;
    return new NextResponse(PLACEHOLDER_SVG, {
      status,
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=30, s-maxage=30",
        "x-media-error": upstream ? `upstream-${upstream.status}` : "timeout-or-network",
      },
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  return new NextResponse(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

const UPSTREAM_TIMEOUT_MS = 7000;

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><rect width="240" height="160" fill="#1e293b"/><g fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M96 84l24-20 24 20"/><path d="M102 80v30h36V80"/></g></svg>';

/** One retry for transient 5xx / timeouts; returns null if the host never answered. */
async function fetchWithRetry(url: string, referer: string): Promise<Response | null> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "image/avif,image/webp,image/*,*/*;q=0.8",
          referer,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        next: { revalidate: 86400 },
      });
      if (response.ok || response.status < 500) return response;
      last = response;
    } catch {
      // timeout or network error: fall through to retry
    }
  }
  return last;
}
