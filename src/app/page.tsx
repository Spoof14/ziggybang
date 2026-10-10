import dynamic from "next/dynamic";

const MapApp = dynamic(() => import("./_components/MapApp"), { ssr: false });

export default function Home() {
  return (
    <>
      {/*
        Server-rendered so crawlers and screen readers get a heading and intro
        even though the interactive map is client-only. The client app renders
        its own visual title (not an h1) to keep a single h1 on the page.
      */}
      <div className="sr-only">
        <h1>Ziggybang: Korea rentals, in English</h1>
        <p>
          An English-language map of Zigbang, Peterpan, and Naver Korea
          rentals: studios, villas, officetels, and apartments, with KRW
          prices and jeonse vs monthly rent explained.
        </p>
      </div>
      <noscript>
        <p className="p-4 text-slate-200">
          Ziggybang is an interactive map of Korea rentals and needs JavaScript
          enabled. Please turn it on to browse listings.
        </p>
      </noscript>
      <MapApp />
    </>
  );
}
