import { NextResponse, type NextRequest } from "next/server";
import { LANG_COOKIE, LANG_HEADER, LANG_PARAM, parseLang, resolveServerLang } from "~/lib/i18n/lang";

/**
 * Resolves the UI language once per request (`?lang=` beats the cookie) and
 * forwards it as a request header so the root layout can render
 * `<html lang>` and the right SEO text on the server. An explicit `?lang=`
 * also refreshes the cookie so a bare `/` later renders the same language.
 */
export function middleware(request: NextRequest) {
  const param = request.nextUrl.searchParams.get(LANG_PARAM);
  const lang = resolveServerLang(param, request.cookies.get(LANG_COOKIE)?.value);
  const headers = new Headers(request.headers);
  headers.set(LANG_HEADER, lang);
  const response = NextResponse.next({ request: { headers } });
  const explicit = parseLang(param);
  if (explicit && request.cookies.get(LANG_COOKIE)?.value !== explicit) {
    response.cookies.set(LANG_COOKIE, explicit, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon|robots.txt|sitemap.xml|.*\\..*).*)"],
};
