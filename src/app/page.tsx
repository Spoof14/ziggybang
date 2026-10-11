import { type Metadata } from "next";
import { parseLang, t } from "~/lib/i18n";

import MapAppClient from "./_components/MapAppClient";

type SearchParams = Record<string, string | string[] | undefined>;

function langFrom(searchParams: SearchParams | undefined) {
  const raw = searchParams?.lang;
  return parseLang(Array.isArray(raw) ? raw[0] : raw) ?? "en";
}

/** `?lang=ko` localizes the title/description; plain `/` stays English. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const lang = langFrom(await searchParams);
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
  const lang = langFrom(await searchParams);
  return (
    <>
      {/*
        Server-rendered so crawlers and screen readers get a heading and intro
        even though the interactive map is client-only. The client app renders
        its own visual title (not an h1) to keep a single h1 on the page.
      */}
      <div className="sr-only">
        <h1>{t(lang, "app.h1")}</h1>
        <p>{t(lang, "app.intro")}</p>
      </div>
      <noscript>
        <p className="p-4 text-slate-200">{t(lang, "app.noscript")}</p>
      </noscript>
      <MapAppClient />
    </>
  );
}
