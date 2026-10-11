import { DEFAULT_LANG, type Lang } from "~/lib/i18n";
import { hasHangul } from "./foreigner";

/**
 * Small Korean → English glossary for the phrases that fill most rental
 * titles and descriptions. This is deliberately NOT a translator: it only
 * swaps well-known terms. Longer terms come first so "풀옵션" wins over "옵션".
 */
const GLOSSARY: ReadonlyArray<readonly [string, string]> = [
  ["즉시입주", "move-in now"],
  ["반려동물", "pets"],
  ["반려견", "dogs"],
  ["반려묘", "cats"],
  ["엘리베이터", "elevator"],
  ["엘베", "elevator"],
  ["주차가능", "parking available"],
  ["주차불가", "no parking"],
  ["주차", "parking"],
  ["풀옵션", "fully furnished"],
  ["옵션", "furnished (options)"],
  ["신축", "new build"],
  ["몰세권", "near a shopping mall"],
  ["숲세권", "near a forest/park"],
  ["초품아", "elementary school next door"],
  ["반려동물가능", "pets allowed"],
  ["보안시설", "security facilities"],
  ["보안", "security"],
  ["방범창", "security window bars"],
  ["무인택배함", "parcel locker"],
  ["풀옵", "fully furnished"],
  ["에어컨", "air conditioner"],
  ["세탁기", "washing machine"],
  ["냉장고", "fridge"],
  ["인덕션", "induction cooktop"],
  ["베란다", "balcony"],
  ["테라스", "terrace"],
  ["공원", "park"],
  ["학세권", "near schools"],
  ["병세권", "near a hospital"],
  ["스세권", "near a Starbucks"],
  ["맥세권", "near a McDonald's"],
  ["CCTV", "CCTV"],
  ["올수리", "fully renovated"],
  ["리모델링", "renovated"],
  ["역세권", "near a subway station"],
  ["남향", "south-facing"],
  ["채광", "natural light"],
  ["관리비", "maintenance fee"],
  ["보증금", "deposit"],
  ["월세", "monthly rent"],
  ["전세", "jeonse"],
  ["대출가능", "loan available"],
  ["전입신고", "move-in registration"],
  ["분리형", "separate kitchen"],
  ["오픈형", "open layout"],
  ["복층", "loft"],
  ["원룸", "studio"],
  ["투룸", "2-room"],
  ["쓰리룸", "3-room"],
  ["반지하", "semi-basement"],
  ["옥탑방", "rooftop unit"],
  ["옥탑", "rooftop"],
  ["도보", "walk"],
  ["협의", "negotiable"],
  ["가능", "OK"],
  ["불가", "not allowed"],
];

const ORDERED = [...GLOSSARY].sort((a, b) => b[0].length - a[0].length);

export type GlossaryTerm = { ko: string; en: string };

/** Glossary terms that appear in `text` (whitespace ignored), in order of first use. */
export function glossaryTerms(text: string | undefined | null): GlossaryTerm[] {
  if (!text || !hasHangul(text)) return [];
  const compact = text.replace(/\s+/g, "");
  const found: Array<GlossaryTerm & { at: number }> = [];
  let masked = compact;
  for (const [ko, en] of ORDERED) {
    const at = masked.indexOf(ko);
    if (at < 0) continue;
    found.push({ ko, en, at });
    masked = masked.split(ko).join("\u0000".repeat(ko.length));
  }
  return found.sort((a, b) => a.at - b.at).map(({ ko, en }) => ({ ko, en }));
}

/**
 * English label for a short structured tag ("몰세권", "분리형 복층"): only when
 * every Korean word in it is a glossary term. Anything else (a free-text
 * sentence, a neighbourhood name) is returned untouched, never half-translated.
 */
export function glossText(text: string | undefined | null, lang: Lang = DEFAULT_LANG): string {
  const value = text?.trim() ?? "";
  if (!value || lang === "ko" || !hasHangul(value)) return value;
  let out = value;
  for (const [ko, en] of ORDERED) out = out.split(ko).join(` ${en} `);
  // Particles/words the glossary does not know would leave Korean behind: keep the original.
  if (hasHangul(out)) return value;
  return out.replace(/\s+/g, " ").replace(/\s+([,.;·])/g, "$1").trim();
}
