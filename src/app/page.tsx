import { type Metadata } from "next";
import { headers } from "next/headers";
import { LANG_HEADER, parseLang, t, DEFAULT_LANG } from "~/lib/i18n";

import { HomeIntro } from "./_components/HomeIntro";
import MapAppClient from "./_components/MapAppClient";

type SearchParams = Record<string, string | string[] | undefined>;

/** `?lang=` first, else the language the middleware resolved from the cookie. */
async function langFrom(searchParams: SearchParams | undefined) {
  const raw = searchParams?.lang;
  return (
    parseLang(Array.isArray(raw) ? raw[0] : raw) ??
    parseLang((await headers()).get(LANG_HEADER)) ??
    DEFAULT_LANG
  );
}

/** `?lang=ko` (or the lang cookie) localizes the title/description. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const lang = await langFrom(await searchParams);
  if (lang === "en") return {};
  const title = t(lang, "app.title");
  const description = t(lang, "app.description");
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, locale: t(lang, "app.ogLocale") },
    twitter: { title, description },
  };
}

export default async function Home({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const lang = await langFrom(await searchParams);
  return (
    <>
      {/*
        Server-rendered so crawlers and screen readers get a heading and intro
        even though the interactive map is client-only. The client app renders
        its own visual title (not an h1) to keep a single h1 on the page.
      */}
      <HomeIntro />
      <noscript>
        <p className="p-4 text-slate-200">{t(lang, "app.noscript")}</p>
      </noscript>
      <MapAppClient />
    </>
  );
}
