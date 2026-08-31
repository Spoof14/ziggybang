import { env } from "~/env";
import { cached } from "./cache";
import { fetchJson, fetchText, HttpError, setCookieValues } from "./http";
import {
  fetchJsonViaUnlocker,
  fetchTextViaUnlocker,
  unlockerConfigured,
} from "./unlocker";

export const NEW_LAND_ORIGIN = "https://new.land.naver.com";
const SESSION_PAGE = `${NEW_LAND_ORIGIN}/complexes`;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const NAVER_HTML_HEADERS = {
  "user-agent": BROWSER_UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

export const NAVER_API_HEADERS = {
  "user-agent": BROWSER_UA,
  referer: SESSION_PAGE,
  accept: "application/json, text/plain, */*",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

export type NaverSession = {
  token: string;
  cookie: string;
};

export type NaverTransport = "direct" | "proxy" | "unlocker";

export function naverProxyUrl(): string | undefined {
  return env.NAVER_PROXY_URL;
}

export function naverTransport(): NaverTransport {
  if (naverProxyUrl()) return "proxy";
  if (unlockerConfigured()) return "unlocker";
  return "direct";
}

export function extractNaverToken(html: string): string | undefined {
  const fromState = html.match(/"token"\s*:\s*\{\s*"token"\s*:\s*"(eyJ[^"]+)"/);
  if (fromState?.[1]) return fromState[1];
  return html.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/)?.[0];
}

export function cookieHeaderFromSetCookie(setCookies: string[]): string {
  return setCookies
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

export function sessionHeaders(session: NaverSession): Record<string, string> {
  return {
    ...NAVER_API_HEADERS,
    authorization: `Bearer ${session.token}`,
    ...(session.cookie ? { cookie: session.cookie } : {}),
  };
}

async function loadSessionPage(timeoutMs: number): Promise<{
  html: string;
  setCookies: string[];
}> {
  const transport = naverTransport();
  if (transport === "unlocker") {
    const html = await fetchTextViaUnlocker(SESSION_PAGE, timeoutMs, undefined, {
      ...NAVER_HTML_HEADERS,
    });
    return { html, setCookies: [] };
  }
  const { text, headers } = await fetchText(SESSION_PAGE, {
    headers: NAVER_HTML_HEADERS,
    timeoutMs,
    proxyUrl: transport === "proxy" ? naverProxyUrl() : undefined,
  });
  return { html: text, setCookies: setCookieValues(headers) };
}

export async function getNaverSession(timeoutMs: number): Promise<NaverSession> {
  return cached("nv:session", SESSION_TTL_MS, async () => {
    const { html, setCookies } = await loadSessionPage(timeoutMs);
    const token = extractNaverToken(html);
    if (!token) {
      throw new HttpError("Naver session page did not include a JWT");
    }
    return { token, cookie: cookieHeaderFromSetCookie(setCookies) };
  });
}

function assertNaverPayload(payload: unknown, url: string): void {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: unknown }).success === false
  ) {
    const code = (payload as { code?: string }).code ?? "rejected";
    throw new HttpError(`Naver ${code} for ${url}`);
  }
}

export async function naverAuthorizedJson<T>(
  url: string,
  timeoutMs: number,
): Promise<T> {
  const session = await getNaverSession(timeoutMs);
  const headers = sessionHeaders(session);
  const transport = naverTransport();
  const payload =
    transport === "unlocker"
      ? await fetchJsonViaUnlocker<T>(url, timeoutMs, undefined, headers)
      : await fetchJson<T>(url, {
          headers,
          timeoutMs,
          proxyUrl: transport === "proxy" ? naverProxyUrl() : undefined,
        });
  assertNaverPayload(payload, url);
  return payload;
}
