import { type Metadata } from "next";
import dynamic from "next/dynamic";
import { parseLang, t } from "~/lib/i18n";

const MapApp = dynamic(() => import("./_components/MapApp"), { ssr: false });

type SearchParams = Record<string, string | string[] | undefined>;

function langFrom(searchParams: SearchParams | undefined) {
  const raw = searchParams?.lang;
  return parseLang(Array.isArray(raw) ? raw[0] : raw) ?? "en";
}

/** `?lang=ko` localizes the title/description; plain `/` stays English. */
export function generateMetadata({
  searchParams,
}: {
  searchParams?: SearchParams;
}): Metadata {
  const lang = langFrom(searchParams);
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

export default function Home({ searchParams }: { searchParams?: SearchParams }) {
  const lang = langFrom(searchParams);
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
      <MapApp />
    </>
  );
}
