export type Place = {
  id: string;
  names: string[];
  lat: number;
  lng: number;
  zoom: number;
  radiusM?: number;
};

export const places: Place[] = [
  { id: "gangnam", names: ["gangnam", "강남", "강남구", "gangnam-gu", "gangnam station", "강남역"], lat: 37.498, lng: 127.028, zoom: 15, radiusM: 800 },
  { id: "seocho", names: ["seocho", "서초", "서초구"], lat: 37.484, lng: 127.033, zoom: 14 },
  { id: "jamsil", names: ["jamsil", "잠실", "송파", "songpa"], lat: 37.513, lng: 127.102, zoom: 14 },
  { id: "seongsu", names: ["seongsu", "성수", "seongdong", "성동"], lat: 37.544, lng: 127.056, zoom: 15 },
  { id: "konkuk", names: ["konkuk", "건대", "건대입구", "gundae"], lat: 37.54, lng: 127.07, zoom: 15 },
  { id: "hongdae", names: ["hongdae", "hongik", "홍대", "홍익", "서교", "seogyo", "hongdae station", "홍대입구역", "hongik university station"], lat: 37.556, lng: 126.923, zoom: 16, radiusM: 800 },
  { id: "hapjeong", names: ["hapjeong", "합정", "망원", "mangwon", "hapjeong station", "합정역"], lat: 37.549, lng: 126.914, zoom: 16, radiusM: 800 },
  { id: "dangsan", names: ["dangsan", "당산", "당산동", "당산역", "dangsan station"], lat: 37.5346, lng: 126.9025, zoom: 16, radiusM: 800 },
  { id: "yeongdeungpo", names: ["yeongdeungpo", "영등포", "영등포구", "yeongdeungpogu"], lat: 37.517, lng: 126.907, zoom: 14 },
  { id: "munrae", names: ["munrae", "mullae", "문래", "문래동"], lat: 37.517, lng: 126.896, zoom: 16 },
  { id: "singil", names: ["singil", "신길", "신길동"], lat: 37.513, lng: 126.921, zoom: 15 },
  { id: "noryangjin", names: ["noryangjin", "노량진"], lat: 37.513, lng: 126.942, zoom: 15 },
  { id: "sindorim", names: ["sindorim", "신도림"], lat: 37.509, lng: 126.891, zoom: 15 },
  { id: "guro-digital", names: ["guro digital", "guro digital complex", "guro digital complex station", "gurodigital", "guro-digital", "gdc", "구로디지털", "구로디지털단지", "구로디지털단지역"], lat: 37.4852, lng: 126.9014, zoom: 16, radiusM: 800 },
  { id: "gasan-digital", names: ["gasan digital", "gasan digital complex", "gasan digital complex station", "gasan", "가산디지털", "가산디지털단지", "가산디지털단지역", "가산"], lat: 37.4816, lng: 126.8828, zoom: 16, radiusM: 800 },
  { id: "guro", names: ["guro", "구로", "구로구", "guro-gu"], lat: 37.495, lng: 126.888, zoom: 14 },
  { id: "daerim", names: ["daerim", "대림", "대림동"], lat: 37.493, lng: 126.895, zoom: 15 },
  { id: "wangsimni", names: ["wangsimni", "왕십리"], lat: 37.561, lng: 127.037, zoom: 15 },
  { id: "seongnam", names: ["seongnam", "성남", "모란", "moran"], lat: 37.42, lng: 127.127, zoom: 13 },
  { id: "yeonnam", names: ["yeonnam", "연남", "연남동", "yeonnam-dong"], lat: 37.566, lng: 126.922, zoom: 16 },
  { id: "mapo", names: ["mapo", "마포", "마포구"], lat: 37.566, lng: 126.902, zoom: 14 },
  { id: "sinchon", names: ["sinchon", "신촌", "이대", "ewha", "sinchon station", "신촌역"], lat: 37.559, lng: 126.937, zoom: 16, radiusM: 800 },
  { id: "itaewon", names: ["itaewon", "이태원", "한남", "hannam", "haebangchon", "hbc", "경리단", "gyeongnidan"], lat: 37.534, lng: 126.994, zoom: 15 },
  { id: "yongsan", names: ["yongsan", "용산", "용산구"], lat: 37.532, lng: 126.965, zoom: 14 },
  { id: "yeouido", names: ["yeouido", "여의도", "여의"], lat: 37.521, lng: 126.924, zoom: 15 },
  { id: "jongno", names: ["jongno", "종로", "광화문", "gwanghwamun", "bukchon", "북촌", "익선", "ikseon"], lat: 37.573, lng: 126.979, zoom: 15 },
  { id: "myeongdong", names: ["myeongdong", "명동", "euljiro", "을지로"], lat: 37.564, lng: 126.983, zoom: 16 },
  { id: "dongdaemun", names: ["dongdaemun", "동대문", "daehangno", "대학로", "혜화", "hyehwa"], lat: 37.571, lng: 127.01, zoom: 15 },
  { id: "gangbuk", names: ["nowon", "노원", "성북", "seongbuk", "길음", "gireum"], lat: 37.654, lng: 127.056, zoom: 13 },
  { id: "sillim", names: ["sillim", "신림", "봉천", "bongcheon", "관악", "gwanak"], lat: 37.484, lng: 126.93, zoom: 14 },
  { id: "sadang", names: ["sadang", "사당", "이수", "isu", "동작", "dongjak"], lat: 37.477, lng: 126.982, zoom: 15 },
  { id: "magok", names: ["magok", "마곡", "마곡동", "발산", "발산동", "balsan"], lat: 37.56, lng: 126.825, zoom: 15 },
  { id: "gangseo", names: ["gangseo", "강서", "강서구", "gangseo-gu"], lat: 37.5509, lng: 126.8497, zoom: 14 },
  { id: "mokdong", names: ["mokdong", "목동", "양천", "yangcheon"], lat: 37.526, lng: 126.875, zoom: 14 },
  { id: "bundang", names: ["bundang", "분당", "서현", "seohyeon", "정자", "jeongja"], lat: 37.383, lng: 127.122, zoom: 14 },
  { id: "pangyo", names: ["pangyo", "판교"], lat: 37.395, lng: 127.111, zoom: 15 },
  { id: "suwon", names: ["suwon", "수원", "영통", "yeongtong"], lat: 37.263, lng: 127.029, zoom: 13 },
  { id: "incheon", names: ["incheon", "인천", "송도", "songdo", "bupyeong", "부평"], lat: 37.456, lng: 126.705, zoom: 12 },
  { id: "busan", names: ["busan", "부산", "해운대", "haeundae", "서면", "seomyeon"], lat: 35.18, lng: 129.075, zoom: 12 },
  { id: "daegu", names: ["daegu", "대구", "동성로", "dongseongno"], lat: 35.872, lng: 128.602, zoom: 13 },
  { id: "daejeon", names: ["daejeon", "대전", "유성", "yuseong"], lat: 36.351, lng: 127.385, zoom: 13 },
  { id: "gwangju", names: ["gwangju", "광주"], lat: 35.16, lng: 126.851, zoom: 13 },
  { id: "jeju", names: ["jeju", "제주", "서귀포", "seogwipo"], lat: 33.5, lng: 126.53, zoom: 11 },
];
