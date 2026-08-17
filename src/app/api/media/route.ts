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

  const upstream = await fetch(target.toString(), {
    headers: {
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      referer,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    next: { revalidate: 86400 },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Image fetch failed" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  return new NextResponse(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
