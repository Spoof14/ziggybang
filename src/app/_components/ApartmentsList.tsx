"use client";
import React, { memo, useMemo } from "react";
import { api } from "~/trpc/react";
import { MapMarker } from "react-kakao-maps-sdk";

export const ApartmentsList = () => {
  const { data: apartments, isLoading } =
    api.apartments.getApartments.useQuery();
  console.log("apartments");
  const totalApartments = useMemo(
    () =>
      apartments?.flatMap((apartment) => apartment.items.slice(0, 300)) ?? [],
    [apartments],
  );

  if (isLoading || apartments === undefined) return null;
  return totalApartments.map((item, i) => (
    <MemoMarker
      key={i + "-" + item.lat + "-" + item.lng}
      lat={item.lat}
      lng={item.lng}
    />
  ));
};

type MarkerProps = {
  lat: number;
  lng: number;
};
const Marker = ({ lat, lng }: MarkerProps) => {
  return <MapMarker position={{ lat, lng }} />;
};

const MemoMarker = memo(Marker);
