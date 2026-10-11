/**
 * Ask reasons: price wording must come from structured data. The model gets
 * pre-formatted per-language price strings and its reason is checked against
 * the listing's real deal type and amounts before it is shown.
 */
import { DEFAULT_LANG, format, messages, t, type Lang, type MessageKey } from "~/lib/i18n";
import { formatKrwFromManwon } from "./copy";
import { effectiveMonthlyManwon } from "./ask-quality";
import { type MapListing } from "./types";

/** "월세 보증금 3,000만원 / 월 40만원", "전세 1억 1,000만원", "Jeonse ₩110 million". */
export function priceText(l: MapListing, lang: Lang = DEFAULT_LANG): string {
  const money = (n?: number) => formatKrwFromManwon(n, lang);
  if (l.salesType === "sale") {
    const price = money(l.price);
    return price ? t(lang, "ask.price.sale", { price }) : t(lang, "ask.price.unknown");
  }
  if (l.salesType === "jeonse") {
    const deposit = money(l.deposit);
    return deposit ? t(lang, "ask.price.jeonse", { deposit }) : t(lang, "ask.price.unknown");
  }
  const deposit = money(l.deposit);
  const rent = money(l.rent);
  if (l.salesType === "wolse" && deposit && rent) return t(lang, "ask.price.wolse", { deposit, rent });
  return t(lang, "ask.price.unknown");
}

type Mention = { won: number; before: string; after: string };

const KO_UNITS: Record<string, number> = { 억: 1e8, 천만: 1e7, 백만: 1e6, 만: 1e4, 천: 1e3, 백: 100 };
const KO_MONEY = /\d[\d,.]*\s*(?:억|천만|백만|만)(?:\s*\d[\d,.]*\s*(?:천만|백만|만|천|백))*\s*원?/g;
const EN_MONEY = /(?:₩|KRW\s*)\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|m|k)?(?![a-z])/gi;
const EN_SCALE: Record<string, number> = { billion: 1e9, bn: 1e9, million: 1e6, mm: 1e6, m: 1e6, thousand: 1e3, k: 1e3 };

/** Every KRW amount a reason states, with a little text on each side for role detection. */
export function moneyMentions(text: string): Mention[] {
  const out: Mention[] = [];
  for (const m of text.matchAll(KO_MONEY)) {
    let won = 0;
    for (const part of m[0].matchAll(/(\d[\d,.]*)\s*(천만|백만|억|만|천|백)/g)) {
      won += Number(part[1]!.replace(/,/g, "")) * (KO_UNITS[part[2]!] ?? 0);
    }
    if (won > 0) out.push({ won, before: text.slice(Math.max(0, m.index - 12), m.index), after: text.slice(m.index + m[0].length, m.index + m[0].length + 14) });
  }
  for (const m of text.matchAll(EN_MONEY)) {
    const scale = m[2] ? (EN_SCALE[m[2].toLowerCase()] ?? 1) : 1;
    const won = Number(m[1]!.replace(/,/g, "")) * scale;
    if (won > 0) out.push({ won, before: text.slice(Math.max(0, m.index - 14), m.index), after: text.slice(m.index + m[0].length, m.index + m[0].length + 16) });
  }
  return out;
}

const MONTHLY_BEFORE = /(?:월세?|매달|monthly(?: rent)?(?: of)?|rent(?: of)?)\s*$/i;
const MONTHLY_AFTER = /^\s*(?:\/\s*(?:mo|month)|per month|a month|monthly|\s*\/\s*월|씩)/i;
const DEPOSIT_BEFORE = /(?:보증금|전세|deposit(?: of)?|jeonse(?: of)?)\s*$/i;
const DEPOSIT_AFTER = /^\s*(?:deposit|jeonse|보증금|전세)/i;

const JEONSE_WORD = /전세|jeonse|chonsei/i;
const MONTHLY_WORD = /월세|monthly[- ]rent|\/\s*mo\b|per month|a month|월\s*\d|\bwolse\b/i;
const LOW_DEPOSIT_CLAIM =
  /\b(?:low|lower|lowest|small|modest|cheap|cheaper)\b[^.·,;]{0,18}\bdeposit|deposit[^.·,;]{0,28}\b(?:low|lower|cheap|cheaper|small|modest|below)\b|보증금[^·,.;]{0,14}(?:낮|저렴|적은|적어|싼|부담이 적)|(?:낮은|저렴한|적은|싼)\s*보증금/i;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.03 + 1;

export type ReasonContext = {
  /** Median deposit (만원) over the candidates considered; a deposit is only "low" below it. */
  medianDeposit?: number;
};

/**
 * False when the reason contradicts the structured listing: wrong rent type,
 * an amount that is none of its prices (or is in the wrong role), or a
 * "low deposit" claim that does not hold against the candidate set.
 */
export function reasonPriceConsistent(reason: string, l: MapListing, ctx: ReasonContext = {}): boolean {
  if (l.salesType === "wolse" || l.salesType === "sale") {
    if (JEONSE_WORD.test(reason)) return false;
  }
  if (l.salesType === "jeonse" && MONTHLY_WORD.test(reason)) return false;
  if (l.salesType === "sale" && MONTHLY_WORD.test(reason)) return false;

  const won = (manwon?: number | null) => (manwon == null ? undefined : manwon * 10_000);
  const deposit = l.salesType === "sale" ? undefined : won(l.deposit);
  const monthly = [l.salesType === "wolse" ? won(l.rent) : undefined, won(l.manageCost), (() => {
    const eff = effectiveMonthlyManwon(l);
    return l.salesType === "wolse" && eff != null ? won(Math.round(eff * 10) / 10) : undefined;
  })()].filter((v): v is number => v != null && v > 0);
  const price = l.salesType === "sale" ? won(l.price) : undefined;
  const any = [deposit, price, ...monthly].filter((v): v is number => v != null);

  for (const m of moneyMentions(reason)) {
    if (!any.some((v) => near(v, m.won))) return false;
    const asMonthly = MONTHLY_BEFORE.test(m.before) || MONTHLY_AFTER.test(m.after);
    const asDeposit = DEPOSIT_BEFORE.test(m.before) || DEPOSIT_AFTER.test(m.after);
    if (asMonthly && !asDeposit && !monthly.some((v) => near(v, m.won))) return false;
    if (asDeposit && !asMonthly) {
      const ok = deposit != null ? near(deposit, m.won) : price != null && near(price, m.won);
      if (!ok) return false;
    }
  }
  if (LOW_DEPOSIT_CLAIM.test(reason)) {
    if (l.deposit == null || ctx.medianDeposit == null || !(l.deposit < ctx.medianDeposit)) return false;
  }
  return true;
}

export function medianOf(values: number[]): number | undefined {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// ------------------------------------------------- assumption re-localisation

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Re-render a stored note (written in `from`) in `to` by matching it against
 * the `ask.assume.*` templates; null when it is not one of ours.
 */
export function relocalizeAssumption(text: string, from: Lang, to: Lang): string | null {
  if (from === to) return text;
  for (const key of Object.keys(messages[from]) as MessageKey[]) {
    if (!key.startsWith("ask.assume.")) continue;
    const template = messages[from][key];
    const names: string[] = [];
    const source = escapeRe(template).replace(/\\\{(\w+)\\\}/g, (_w, name: string) => {
      names.push(name);
      return "(.+?)";
    });
    const match = new RegExp(`^${source}$`).exec(text);
    if (!match) continue;
    const params: Record<string, string> = {};
    names.forEach((name, i) => (params[name] = match[i + 1]!));
    return format(messages[to][key], params);
  }
  return null;
}
