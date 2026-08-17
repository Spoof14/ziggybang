export type Place = {
  id: string;
  names: string[];
  lat: number;
  lng: number;
  zoom: number;
};

export const places: Place[] = [
  { id: "gangnam", names: ["gangnam", "강남", "강남구", "gangnam-gu"], lat: 37.498, lng: 127.028, zoom: 14 },
  { id: "seocho", names: ["seocho", "서초", "서초구"], lat: 37.484, lng: 127.033, zoom: 14 },
  { id: "jamsil", names: ["jamsil", "잠실", "송파", "songpa"], lat: 37.513, lng: 127.102, zoom: 14 },
  { id: "seongsu", names: ["seongsu", "성수", "seongdong", "성동"], lat: 37.544, lng: 127.056, zoom: 15 },
  { id: "konkuk", names: ["konkuk", "건대", "건대입구", "gundae"], lat: 37.54, lng: 127.07, zoom: 15 },
  { id: "hongdae", names: ["hongdae", "hongik", "홍대", "홍익", "서교", "seogyo"], lat: 37.556, lng: 126.923, zoom: 15 },
  { id: "hapjeong", names: ["hapjeong", "합정", "망원", "mangwon"], lat: 37.549, lng: 126.914, zoom: 15 },
  { id: "yeonnam", names: ["yeonnam", "연남", "연남동", "yeonnam-dong"], lat: 37.566, lng: 126.922, zoom: 16 },
  { id: "mapo", names: ["mapo", "마포", "마포구"], lat: 37.566, lng: 126.902, zoom: 14 },
  { id: "sinchon", names: ["sinchon", "신촌", "이대", "ewha"], lat: 37.559, lng: 126.937, zoom: 15 },
  { id: "itaewon", names: ["itaewon", "이태원", "한남", "hannam", "haebangchon", "hbc", "경리단", "gyeongnidan"], lat: 37.534, lng: 126.994, zoom: 15 },
  { id: "yongsan", names: ["yongsan", "용산", "용산구"], lat: 37.532, lng: 126.965, zoom: 14 },
  { id: "yeouido", names: ["yeouido", "여의도", "여의"], lat: 37.521, lng: 126.924, zoom: 15 },
  { id: "jongno", names: ["jongno", "종로", "광화문", "gwanghwamun", "bukchon", "북촌", "익선", "ikseon"], lat: 37.573, lng: 126.979, zoom: 15 },
  { id: "myeongdong", names: ["myeongdong", "명동", "euljiro", "을지로"], lat: 37.564, lng: 126.983, zoom: 16 },
  { id: "dongdaemun", names: ["dongdaemun", "동대문", "daehangno", "대학로", "혜화", "hyehwa"], lat: 37.571, lng: 127.01, zoom: 15 },
  { id: "gangbuk", names: ["nowon", "노원", "성북", "seongbuk", "길음", "gireum"], lat: 37.654, lng: 127.056, zoom: 13 },
  { id: "sillim", names: ["sillim", "신림", "봉천", "bongcheon", "관악", "gwanak"], lat: 37.484, lng: 126.93, zoom: 14 },
  { id: "sadang", names: ["sadang", "사당", "이수", "isu", "동작", "dongjak"], lat: 37.477, lng: 126.982, zoom: 15 },
  { id: "magok", names: ["magok", "마곡", "발산", "balsan"], lat: 37.56, lng: 126.825, zoom: 15 },
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
