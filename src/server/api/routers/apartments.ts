import { unstable_cache } from "next/cache";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const geoHashPrefix = "wyd";
const geoHashes = ["h", "j", "n", "k", "m", "q"];
const payload = {
  depositMin: "0",
  rentMin: "0",
  "salesTypes[0]": "전세", //"%EC%A0%84%EC%84%B8",
  "salesTypes[1]": "월세", //"%EC%9B%94%EC%84%B8",
  "salesTypes[2]": "매매", //"%EB%A7%A4%EB%A7%A4",
  salesPriceMin: "0",
  domain: "zigbang",
  checkAnyItemWithoutFilter: "true",
};
const zigbangApi = "https://apis.zigbang.com/v2/items/villa?";

type Item = {
  itemBmType: string;
  itemId: number;
  lat: number;
  lng: number;
};
type Subway = {
  address: string;
  description: string;
  id: number;
  lat: number;
  lng: number;
  local1: string;
  name: string;
  subwayArea: string;
};
type Section = {
  type: string;
  itemIds: number[];
};
type ZigbangResponse = {
  anyItemWithoutFilter: boolean;
  items: Item[];
  sections: Section[];
  subways: Subway[];
};

async function INTERNAL_fetchGeohashItems(geohash: string) {
  const data = await fetch(
    zigbangApi +
      new URLSearchParams({
        ...payload,
        geohash,
      }).toString(),
  );
  return data.json() as Promise<ZigbangResponse>;
}
export const fetchHash = unstable_cache(
  INTERNAL_fetchGeohashItems,
  ["fetchHash"],
  { revalidate: 60 * 60 * 24 },
);

export const apartmentsRouter = createTRPCRouter({
  getApartments: publicProcedure.query(async () => {
    // const data = await fetch(
    //   zigbangApi +
    //     new URLSearchParams({
    //       ...payload,
    //       geohash: geoHashPrefix + "h",
    //     }).toString(),
    // );
    // console.log(data);
    // return data.json();

    return await Promise.all(
      geoHashes.map(async (hash) => fetchHash(geoHashPrefix + hash)),
    );
  }),
});
