"use client";
import { api } from "~/trpc/react";
import { Map, MapMarker } from "react-kakao-maps-sdk";
import { ApartmentsList } from "./ApartmentsList";
import { useState } from "react";

export function ApartmentMap() {
  const [zoom, setZoom] = useState(8);
  console.log(zoom);

  return (
    <Map
      center={{ lat: 37.27845, lng: 126.84993 }}
      style={{ flex: 1, width: "100%", height: "100%" }}
      onZoomChanged={(map) => setZoom(map.getLevel())}
      level={zoom}
    >
      <ApartmentsList />
    </Map>
  );
}
