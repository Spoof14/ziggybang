import dynamic from "next/dynamic";

const MapApp = dynamic(() => import("./_components/MapApp"), { ssr: false });

export default function Home() {
  return <MapApp />;
}
