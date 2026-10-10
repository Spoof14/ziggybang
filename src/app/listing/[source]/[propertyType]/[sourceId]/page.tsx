import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingDetailView } from "~/app/_components/ListingDetailView";
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

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const path = parseListingPath(params);
  if (!path) return { title: "Listing · Ziggybang" };
  try {
    const listing = await getListingDetail(path);
    const title =
      [englishCardTitle(listing), listing.title].find((value) => value?.trim()) ??
      "Listing";
    const photo = listingPhotoUrl(listing.photos?.[0], 1200);
    return {
      title: `${title} · Ziggybang`,
      description: listing.description?.slice(0, 160) ?? title,
      alternates: { canonical: listingPagePath(path) },
      openGraph: {
        type: "article",
        title: `${title} · Ziggybang`,
        description: listing.description?.slice(0, 160) ?? title,
        url: listingPagePath(path),
        ...(photo ? { images: [{ url: photo }] } : {}),
      },
    };
  } catch {
    return { title: "Listing · Ziggybang" };
  }
}

export default async function ListingPage({ params }: { params: PageParams }) {
  const path = parseListingPath(params);
  if (!path) notFound();
  let initial = null;
  try {
    initial = await getListingDetail(path);
  } catch {
    initial = null;
  }
  return <ListingDetailView path={path} initial={initial} />;
}
