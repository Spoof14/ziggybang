import Link from "next/link";
import Script from "next/script";

import { LatestPost } from "~/app/_components/post";
import { api, HydrateClient } from "~/trpc/server";
import { ApartmentMap } from "./_components/map";

export default async function Home() {
  void api.post.getLatest.prefetch();

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <Script
          src={
            "//dapi.kakao.com/v2/maps/sdk.js?appkey=" +
            process.env.kakao_api_key +
            "&libraries=services,clusterer&autoload=false"
          }
          strategy="beforeInteractive"
        />
        <ApartmentMap />
        <LatestPost />
      </main>
    </HydrateClient>
  );
}
