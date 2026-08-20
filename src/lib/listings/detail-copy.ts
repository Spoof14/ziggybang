const OPTION_LABEL: Record<string, string> = {
  에어컨: "Air conditioner",
  냉장고: "Refrigerator",
  세탁기: "Washer",
  건조기: "Dryer",
  인덕션: "Induction cooktop",
  가스레인지: "Gas stove",
  전자레인지: "Microwave",
  신발장: "Shoe closet",
  싱크대: "Kitchen sink",
  옷장: "Closet",
  침대: "Bed",
  책상: "Desk",
  TV: "TV",
  텔레비전: "TV",
  인터넷: "Internet",
  와이파이: "Wi-Fi",
  붙박이장: "Built-in closet",
  식탁: "Dining table",
  소파: "Sofa",
  가스오븐: "Gas oven",
  전기오븐: "Electric oven",
  비데: "Bidet",
  샤워부스: "Shower stall",
  욕조: "Bathtub",
  세탁건조기: "Washer-dryer",
  식기세척기: "Dishwasher",
  비디오폰: "Video phone",
  현관보안: "Door security",
  무인택배함: "Parcel locker",
  화재경보기: "Fire alarm",
  베란다: "Veranda",
  테라스: "Terrace",
};

const UTILITY_LABEL: Record<string, string> = {
  수도: "Water",
  전기: "Electricity",
  가스: "Gas",
  인터넷: "Internet",
  TV: "TV",
  난방: "Heating",
  "일반(공용) 관리비": "Building common area",
  "기타 관리비": "Other fees",
};

const AMENITY_LABEL: Record<string, string> = {
  더블역세권: "Two subway stations nearby",
  대학권: "Near a university",
  슬세권: "Shops and restaurants nearby",
  공세권: "Near a park",
  학세권: "Near academies",
  역세권: "Near a subway station",
};

const POI_LABEL: Record<string, string> = {
  지하철역: "Subway",
  세탁소: "Laundry",
  카페: "Cafe",
  약국: "Pharmacy",
  대형마트: "Superstore",
  편의점: "Convenience store",
  버스정류장: "Bus stop",
  병원: "Hospital",
  공원: "Park",
  학교: "School",
  은행: "Bank",
};

const RESIDENCE_LABEL: Record<string, string> = {
  단독주택: "Detached house",
  다가구주택: "Multi-household house",
  다세대주택: "Multi-family house",
  연립주택: "Townhouse",
  오피스텔: "Officetel",
  아파트: "Apartment",
  빌라: "Villa",
};

const LINE_LABEL: Record<string, string> = {
  경의중앙선: "Gyeongui–Jungang",
  수인분당선: "Suin–Bundang",
  신분당선: "Shinbundang",
  경춘선: "Gyeongchun",
  공항철도: "AREX",
  경강선: "Gyeonggang",
  서해선: "Seohae",
  우이신설선: "Ui-Sinseol",
  신림선: "Sillim Line",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function translateListingTerm(
  value: string | undefined,
  table: Record<string, string>,
): string | null {
  if (!value?.trim()) return null;
  return table[value.trim()] ?? value.trim();
}

export function translateOption(value: string): string {
  return translateListingTerm(value, OPTION_LABEL) ?? value;
}

export function translateUtility(value: string): string {
  return translateListingTerm(value, UTILITY_LABEL) ?? value;
}

export function translateAmenity(value: string): string {
  return translateListingTerm(value, AMENITY_LABEL) ?? value;
}

export function translatePoi(value: string): string {
  return translateListingTerm(value, POI_LABEL) ?? value;
}

export function translateResidence(value?: string): string | null {
  return translateListingTerm(value, RESIDENCE_LABEL);
}

export function translateParking(value?: string): string | null {
  if (!value?.trim()) return null;
  const text = value.trim();
  if (text.includes("불가능") || text.includes("불가")) return "No parking";
  if (text.includes("가능")) {
    const count = text.match(/(\d+)\s*대/);
    if (count?.[1]) return `Parking for ${count[1]} car${count[1] === "1" ? "" : "s"}`;
    return "Parking available";
  }
  return text;
}

export function translateDirection(value?: string): string | null {
  if (!value?.trim()) return null;
  const key = value.trim().toUpperCase();
  const names: Record<string, string> = {
    N: "North",
    NE: "Northeast",
    E: "East",
    SE: "Southeast",
    S: "South",
    SW: "Southwest",
    W: "West",
    NW: "Northwest",
  };
  return names[key] ?? value.trim();
}

export function translateSubwayLine(value?: string): string | null {
  if (!value?.trim()) return null;
  return value
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((part) => {
      const numbered = part.match(/^(\d+)호선$/);
      if (numbered) return `Line ${numbered[1]}`;
      return LINE_LABEL[part] ?? part;
    })
    .join(", ");
}

export function formatApproveYear(value?: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const year = Number(digits.slice(0, 4));
  if (year < 1900 || year > 2100) return null;
  return `Built ${year}`;
}

export function formatListedAt(value?: string): string | null {
  const date = parseLooseDate(value);
  if (!date) return null;
  return `Listed ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatMoveIn(value?: string): string | null {
  if (!value?.trim()) return null;
  const text = value.trim();
  if (/즉시/.test(text)) return "Move-in immediate";
  const date = parseLooseDate(text);
  const negotiable = /협의/.test(text);
  if (date) {
    const stamp = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    return negotiable
      ? `Move-in from ${stamp} (negotiable)`
      : `Move-in from ${stamp}`;
  }
  return text;
}

export function formatKoreanPhone(value?: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return value;
  if (digits.startsWith("02") && digits.length >= 9) {
    return `02-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

export function telHref(value?: string): string | null {
  const digits = value?.replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith("0")) return `tel:+82${digits.slice(1)}`;
  return `tel:${digits}`;
}

function parseLooseDate(value?: string): Date | null {
  if (!value) return null;
  const compact = value.match(/(\d{4})[.\-/]?(\d{2})[.\-/]?(\d{2})/);
  if (!compact) return null;
  const year = Number(compact[1]);
  const month = Number(compact[2]);
  const day = Number(compact[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
