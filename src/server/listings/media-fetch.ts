const ALLOWED_HOSTS = [
  "ic.zigbang.com",
  "landthumb-phinf.pstatic.net",
  "ssl.pstatic.net",
  "img.peterpanz.com",
  "peterpanz.com",
];

function hostAllowed(hostname: string) {
  const host = hostname.replace(/^www\./, "");
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export async function fetchImageBytes(raw: string): Promise<string | null> {
  let target: URL;
  try {
    target = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return null;
  }
  if (!hostAllowed(target.hostname)) return null;

  const referer = target.hostname.includes("pstatic") || target.hostname.includes("naver")
    ? "https://m.land.naver.com/"
    : target.hostname.includes("peterpanz")
      ? "https://www.peterpanz.com/"
      : "https://www.zigbang.com/";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        referer,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < 800 || buffer.byteLength > 1_400_000) return null;
    const mime = response.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
