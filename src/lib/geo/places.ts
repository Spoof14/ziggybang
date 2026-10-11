export type Place = {
  id: string;
  /** Korean display name for Korean UI; falls back to the first Hangul alias. */
  ko?: string;
  /** Korean 구 (district) the place lies in; used to reject mismatched district labels. */
  gu?: string;
  names: string[];
  lat: number;
  lng: number;
  zoom: number;
  radiusM?: number;
  /** A street address resolved only to its district; no exact point. */
  districtOnly?: boolean;
  /** Resolved to a street (no exact house number). */
  roadLevel?: boolean;
};

export const places: Place[] = [
  { id: "gangnam", gu: "강남구", names: ["gangnam", "강남", "강남구", "gangnam-gu", "gangnam station", "강남역"], lat: 37.4979, lng: 127.0276, zoom: 15, radiusM: 800 },
  { id: "apgujeong", gu: "강남구", names: ["apgujeong", "압구정", "압구정동", "apgujeong station", "압구정역"], lat: 37.5271, lng: 127.0285, zoom: 16, radiusM: 800 },
  { id: "cheongdam", gu: "강남구", names: ["cheongdam", "청담", "청담동", "cheongdam station", "청담역"], lat: 37.5191, lng: 127.0517, zoom: 16, radiusM: 800 },
  { id: "seocho", gu: "서초구", names: ["seocho", "서초", "서초구"], lat: 37.484, lng: 127.033, zoom: 14 },
  { id: "jamsil", ko: "잠실", gu: "송파구", names: ["jamsil", "잠실", "송파", "songpa"], lat: 37.5133, lng: 127.1001, zoom: 14 },
  { id: "gangdong", gu: "강동구", names: ["gangdong", "강동", "강동구", "gangdong-gu", "cheonho", "천호", "천호동"], lat: 37.53, lng: 127.1237, zoom: 14 },
  { id: "seongsu", gu: "성동구", names: ["seongsu", "성수", "seongdong", "성동"], lat: 37.5446, lng: 127.0557, zoom: 15 },
  { id: "konkuk", gu: "광진구", names: ["konkuk", "건대", "건대입구", "gundae", "화양동"], lat: 37.5404, lng: 127.0692, zoom: 15 },
  { id: "gwangjin", gu: "광진구", names: ["gwangjin", "광진", "광진구", "gwangjin-gu"], lat: 37.538, lng: 127.082, zoom: 14 },
  { id: "seoul-station", ko: "서울역", names: ["seoul station", "seoulyeok", "서울역"], lat: 37.5547, lng: 126.9707, zoom: 16, radiusM: 800 },
  { id: "hongdae", ko: "홍대", gu: "마포구", names: ["hongdae", "hongik", "홍대", "홍익", "서교", "seogyo", "hongdae station", "홍대입구역", "hongik university station"], lat: 37.5563, lng: 126.9236, zoom: 16, radiusM: 800 },
  { id: "hapjeong", gu: "마포구", names: ["hapjeong", "합정", "hapjeong station", "합정역"], lat: 37.5496, lng: 126.9139, zoom: 16, radiusM: 800 },
  { id: "mangwon", gu: "마포구", names: ["mangwon", "mangwon-dong", "망원", "망원동", "망원역", "mangwon station"], lat: 37.556, lng: 126.91, zoom: 16, radiusM: 800 },
  { id: "dangsan", gu: "영등포구", names: ["dangsan", "당산", "당산동", "당산역", "dangsan station"], lat: 37.5343, lng: 126.9023, zoom: 16, radiusM: 800 },
  { id: "yeongdeungpo", gu: "영등포구", names: ["yeongdeungpo", "영등포", "영등포구", "yeongdeungpogu"], lat: 37.5155, lng: 126.9076, zoom: 14 },
  { id: "munrae", gu: "영등포구", names: ["munrae", "mullae", "문래", "문래동"], lat: 37.517, lng: 126.896, zoom: 16 },
  { id: "singil", gu: "영등포구", names: ["singil", "신길", "신길동"], lat: 37.513, lng: 126.921, zoom: 15 },
  { id: "noryangjin", gu: "동작구", names: ["noryangjin", "노량진"], lat: 37.5133, lng: 126.9425, zoom: 15 },
  { id: "sindorim", gu: "구로구", names: ["sindorim", "신도림"], lat: 37.5088, lng: 126.8913, zoom: 15 },
  { id: "guro-digital", ko: "구로디지털단지", gu: "구로구", names: ["guro digital", "guro digital complex", "guro digital complex station", "gurodigital", "guro-digital", "gdc", "구로디지털", "구로디지털단지", "구로디지털단지역"], lat: 37.4852, lng: 126.9014, zoom: 16, radiusM: 800 },
  { id: "gasan-digital", ko: "가산디지털단지", gu: "금천구", names: ["gasan digital", "gasan digital complex", "gasan digital complex station", "gasan", "가산디지털", "가산디지털단지", "가산디지털단지역", "가산", "가산동"], lat: 37.4816, lng: 126.8828, zoom: 16, radiusM: 800 },
  { id: "geumcheon", gu: "금천구", names: ["geumcheon", "금천", "금천구", "geumcheon-gu"], lat: 37.4565, lng: 126.8954, zoom: 14 },
  { id: "guro", gu: "구로구", names: ["guro", "구로", "구로구", "guro-gu"], lat: 37.495, lng: 126.888, zoom: 14 },
  { id: "daerim", names: ["daerim", "대림", "대림동"], lat: 37.493, lng: 126.895, zoom: 15 },
  { id: "wangsimni", gu: "성동구", names: ["wangsimni", "왕십리"], lat: 37.5612, lng: 127.0371, zoom: 15 },
  { id: "seongnam", ko: "성남", names: ["seongnam", "성남", "모란", "moran"], lat: 37.42, lng: 127.127, zoom: 13 },
  { id: "yeonnam", gu: "마포구", names: ["yeonnam", "연남", "연남동", "yeonnam-dong"], lat: 37.566, lng: 126.922, zoom: 16 },
  { id: "mapo", gu: "마포구", names: ["mapo", "마포", "마포구"], lat: 37.5663, lng: 126.9019, zoom: 14 },
  { id: "sinchon", gu: "서대문구", names: ["sinchon", "신촌", "신촌동", "이대", "ewha", "sinchon station", "신촌역"], lat: 37.5551, lng: 126.9367, zoom: 16, radiusM: 800 },
  { id: "seodaemun", gu: "서대문구", names: ["seodaemun", "서대문", "서대문구", "seodaemun-gu"], lat: 37.5791, lng: 126.9368, zoom: 14 },
  { id: "itaewon", ko: "이태원", gu: "용산구", names: ["itaewon", "이태원", "한남", "hannam", "haebangchon", "hbc", "경리단", "gyeongnidan"], lat: 37.5345, lng: 126.9946, zoom: 15 },
  { id: "yongsan", gu: "용산구", names: ["yongsan", "용산", "용산구"], lat: 37.532, lng: 126.965, zoom: 14 },
  { id: "yeouido", gu: "영등포구", names: ["yeouido", "여의도", "여의"], lat: 37.5219, lng: 126.9245, zoom: 15 },
  { id: "jongno", ko: "종로", gu: "종로구", names: ["jongno", "종로", "광화문", "gwanghwamun", "bukchon", "북촌", "익선", "ikseon"], lat: 37.573, lng: 126.979, zoom: 15 },
  { id: "myeongdong", gu: "중구", names: ["myeongdong", "명동", "euljiro", "을지로"], lat: 37.564, lng: 126.983, zoom: 16 },
  { id: "dongdaemun", ko: "동대문", names: ["dongdaemun", "동대문", "daehangno", "대학로", "혜화", "hyehwa"], lat: 37.571, lng: 127.01, zoom: 15 },
  { id: "jungnang", gu: "중랑구", names: ["jungnang", "중랑", "중랑구", "jungnang-gu"], lat: 37.6063, lng: 127.093, zoom: 14 },
  { id: "nowon", gu: "노원구", names: ["nowon", "노원", "노원구", "nowon-gu"], lat: 37.654, lng: 127.056, zoom: 14 },
  { id: "seongbuk", gu: "성북구", names: ["seongbuk", "성북", "성북구", "seongbuk-gu", "gireum", "길음", "길음동"], lat: 37.5894, lng: 127.0167, zoom: 14 },
  { id: "gangbuk", gu: "강북구", names: ["gangbuk", "강북", "강북구", "gangbuk-gu", "mia", "미아", "suyu", "수유"], lat: 37.6395, lng: 127.0255, zoom: 14 },
  { id: "dobong", gu: "도봉구", names: ["dobong", "도봉", "도봉구", "dobong-gu"], lat: 37.6686, lng: 127.0466, zoom: 14 },
  { id: "eunpyeong", gu: "은평구", names: ["eunpyeong", "은평", "은평구", "eunpyeong-gu", "yeonsinnae", "연신내"], lat: 37.6024, lng: 126.9293, zoom: 14 },
  { id: "sillim", ko: "신림", gu: "관악구", names: ["sillim", "신림", "봉천", "bongcheon", "관악", "gwanak"], lat: 37.484, lng: 126.93, zoom: 14 },
  { id: "sadang", ko: "사당", gu: "동작구", names: ["sadang", "사당", "이수", "isu", "동작", "dongjak"], lat: 37.477, lng: 126.982, zoom: 15 },
  { id: "magok", gu: "강서구", names: ["magok", "마곡", "마곡동", "발산", "발산동", "balsan"], lat: 37.56, lng: 126.825, zoom: 15 },
  { id: "hwagok", gu: "강서구", names: ["hwagok", "화곡", "화곡동", "hwagok station", "화곡역"], lat: 37.5417, lng: 126.8404, zoom: 16, radiusM: 800 },
  { id: "gayang", gu: "강서구", names: ["gayang", "가양", "가양동", "gayang station", "가양역"], lat: 37.5611, lng: 126.8551, zoom: 16, radiusM: 800 },
  { id: "gangseo", gu: "강서구", names: ["gangseo", "강서", "강서구", "gangseo-gu"], lat: 37.5509, lng: 126.8497, zoom: 14 },
  { id: "mokdong", ko: "목동", gu: "양천구", names: ["mokdong", "목동", "양천", "yangcheon"], lat: 37.526, lng: 126.875, zoom: 14 },
  { id: "bundang", ko: "분당", names: ["bundang", "분당", "서현", "seohyeon", "정자", "jeongja"], lat: 37.383, lng: 127.122, zoom: 14 },
  { id: "pangyo", names: ["pangyo", "판교"], lat: 37.395, lng: 127.111, zoom: 15 },
  { id: "suwon", ko: "수원", names: ["suwon", "수원", "영통", "yeongtong"], lat: 37.263, lng: 127.029, zoom: 13 },
  { id: "incheon", ko: "인천", names: ["incheon", "인천", "송도", "songdo", "bupyeong", "부평"], lat: 37.456, lng: 126.705, zoom: 12 },
  { id: "busan", ko: "부산", names: ["busan", "부산", "해운대", "haeundae", "서면", "seomyeon"], lat: 35.18, lng: 129.075, zoom: 12 },
  { id: "daegu", ko: "대구", names: ["daegu", "대구", "동성로", "dongseongno"], lat: 35.872, lng: 128.602, zoom: 13 },
  { id: "daejeon", ko: "대전", names: ["daejeon", "대전", "유성", "yuseong"], lat: 36.351, lng: 127.385, zoom: 13 },
  { id: "gwangju", ko: "광주", names: ["gwangju", "광주"], lat: 35.16, lng: 126.851, zoom: 13 },
  { id: "jeju", ko: "제주", names: ["jeju", "제주", "서귀포", "seogwipo"], lat: 33.5, lng: 126.53, zoom: 11 },
];

const HANGUL = /[가-힣]/;

function titleWords(value: string): string {
  return value.replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}

/** Catalog place whose id or any alias equals `name` (case-insensitive), if any. */
export function placeByName(name: string): Place | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return places.find((p) => p.id === key || p.names.some((n) => n.toLowerCase() === key));
}

/** Korean display name ("망원") for a catalog place. */
export function placeKo(place: Place): string {
  return place.ko ?? place.names.find((n) => HANGUL.test(n)) ?? titleWords(place.names[0] ?? place.id);
}

/** English display name ("Mangwon") for a catalog place. */
export function placeEn(place: Place): string {
  const first = place.names.find((n) => !HANGUL.test(n)) ?? place.id;
  return titleWords(first);
}

/**
 * Display name for a stored place name in the UI language. Catalog places get
 * their Korean/English name; free-text geocoded names pass through.
 */
export function placeDisplayName(name: string, lang: "en" | "ko"): string {
  const place = placeByName(name);
  if (place) return lang === "ko" ? placeKo(place) : placeEn(place);
  return titleWords(name);
}
