import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingDetailView } from "~/app/_components/ListingDetailView";
import { parseLang, t } from "~/lib/i18n";
import { englishCardTitle } from "~/lib/listings/english";
import { listingPagePath, parseListingPath } from "~/lib/listings/path";
import { listingPhotoUrl } from "~/lib/listings/photo";
import { getListingDetail } from "~/server/listings/aggregate";

export const revalidate = 300;

type PageParams = {
  source: string;
  propertyType: string;
  sourceId: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const rawLang = (await searchParams)?.lang;
  const lang = parseLang(Array.isArray(rawLang) ? rawLang[0] : rawLang) ?? "en";
  const suffix = t(lang, "app.listingSuffix");
  const fallbackTitle = `${t(lang, "app.listingTitle")} · ${suffix}`;
  const path = parseListingPath(await params);
  if (!path) return { title: fallbackTitle };
  try {
    const listing = await getListingDetail(path);
    const title =
      [englishCardTitle(listing, lang), listing.title].find((value) => value?.trim()) ??
      t(lang, "app.listingTitle");
    const photo = listingPhotoUrl(listing.photos?.[0], 1200);
    return {
      title: `${title} · ${suffix}`,
      description: listing.description?.slice(0, 160) ?? title,
      alternates: { canonical: listingPagePath(path) },
      openGraph: {
        type: "article",
        title: `${title} · ${suffix}`,
        locale: t(lang, "app.ogLocale"),
        description: listing.description?.slice(0, 160) ?? title,
        url: listingPagePath(path),
        ...(photo ? { images: [{ url: photo }] } : {}),
      },
    };
  } catch {
    return { title: fallbackTitle };
  }
}

export default async function ListingPage({ params }: { params: Promise<PageParams> }) {
  const path = parseListingPath(await params);
  if (!path) notFound();
  let initial = null;
  try {
    initial = await getListingDetail(path);
  } catch {
    initial = null;
  }
  return <ListingDetailView path={path} initial={initial} />;
}
