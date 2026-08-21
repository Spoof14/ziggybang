import { describe, expect, it } from "vitest";
import {
  geocodeKorea,
  geocodeQueryCandidates,
  pickNominatimHit,
  type NominatimHit,
} from "./geocode";

const cheongdamBuilding: NominatimHit = {
  lat: "37.5236673",
  lon: "127.0399903",
  category: "building",
  type: "commercial",
  addresstype: "building",
  name: "강서",
  display_name: "강서, 도산대로55길, 청담동, 강남구, 서울특별시, 06014, 대한민국",
  importance: 0.00007,
  place_rank: 30,
};

const busanGangseo: NominatimHit = {
  lat: "35.2120000",
  lon: "128.9805000",
  category: "boundary",
  type: "administrative",
  addresstype: "borough",
  name: "강서구",
  display_name: "강서구, 부산광역시, 대한민국",
  importance: 0.439,
  place_rank: 12,
};

const seoulGangseo: NominatimHit = {
  lat: "37.5509000",
  lon: "126.8497000",
  category: "boundary",
  type: "administrative",
  addresstype: "borough",
  name: "강서구",
  display_name: "강서구, 서울특별시, 대한민국",
  importance: 0.513,
  place_rank: 12,
  boundingbox: ["37.5264842", "37.6046024", "126.7645064", "126.8807919"],
};

const daeguGangbukLanduse: NominatimHit = {
  lat: "35.9161439",
  lon: "128.5437517",
  category: "landuse",
  type: "residential",
  addresstype: "residential",
  name: "강북 이진 캐스빌",
  display_name: "강북 이진 캐스빌, 태전1동, 북구, 대구광역시, 대한민국",
  importance: 0.0001,
  place_rank: 30,
};

const geumcheonRiver: NominatimHit = {
  lat: "36.2312454",
  lon: "126.8637882",
  category: "waterway",
  type: "river",
  addresstype: "river",
  name: "금천",
  display_name: "금천, 석동리, 부여군, 충청남도, 대한민국",
};

const seoulGangbuk: NominatimHit = {
  lat: "37.6395000",
  lon: "127.0255000",
  category: "boundary",
  type: "administrative",
  addresstype: "borough",
  name: "강북구",
  display_name: "강북구, 서울특별시, 대한민국",
  importance: 0.5,
  place_rank: 12,
};

describe("Nominatim neighborhood picks", () => {
  it("skips a Gangnam building named 강서 and prefers Seoul Gangseo-gu", () => {
    const hit = pickNominatimHit(
      [cheongdamBuilding, busanGangseo, seoulGangseo],
      "강서",
    );
    expect(hit?.name).toBe("강서구");
    expect(hit?.lat).toBe("37.5509000");
    expect(Number(hit?.lon)).toBeLessThan(127);
  });

  it("does not fall back to a POI when no neighborhood hit exists", () => {
    expect(pickNominatimHit([cheongdamBuilding], "강서")).toBeUndefined();
  });

  it("tries the 구 district name before the raw Hangul query", () => {
    expect(geocodeQueryCandidates("강서")[0]).toBe("강서구");
    expect(geocodeQueryCandidates("강서구")[0]).toBe("강서구 서울");
  });

  it("skips Daegu apartments and rivers named after Seoul districts", () => {
    expect(pickNominatimHit([daeguGangbukLanduse], "강북")).toBeUndefined();
    expect(pickNominatimHit([geumcheonRiver], "금천")).toBeUndefined();
    const hit = pickNominatimHit([daeguGangbukLanduse, seoulGangbuk], "강북");
    expect(hit?.name).toBe("강북구");
    expect(hit?.lat).toBe("37.6395000");
  });
});

describe("geocodeKorea catalog", () => {
  it("returns Gangseo-gu for 강서 without using OpenStreetMap", async () => {
    const place = await geocodeKorea("강서");
    expect(place?.id).toBe("gangseo");
    expect(place?.lng).toBeLessThan(127);
    expect(place?.lat).toBeCloseTo(37.55, 1);
  });

  it("returns Seoul Gangbuk-gu for 강북", async () => {
    const place = await geocodeKorea("강북");
    expect(place?.id).toBe("gangbuk");
    expect(place?.lat).toBeCloseTo(37.64, 1);
  });
});
