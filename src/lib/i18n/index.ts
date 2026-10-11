import { DEFAULT_LANG, type Lang } from "./lang";
import { en, type MessageKey } from "./messages.en";
import { ko } from "./messages.ko";

export * from "./lang";
export type { MessageKey } from "./messages.en";

export const messages: Record<Lang, Record<MessageKey, string>> = { en, ko };

export type Params = Record<string, string | number>;

/** Fills `{name}` placeholders. Unknown placeholders are left in place. */
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function t(lang: Lang, key: MessageKey, params?: Params): string {
  const template = messages[lang]?.[key] ?? messages[DEFAULT_LANG][key];
  return format(template, params);
}

/** Pluralised message: uses `<key>_one` for 1 and `<key>_other` otherwise (Korean has both, identical). */
export function tn(
  lang: Lang,
  key: string,
  count: number,
  params?: Params,
): string {
  const suffix = lang === "en" && count === 1 ? "_one" : "_other";
  return t(lang, `${key}${suffix}` as MessageKey, { n: count, ...params });
}

export type Translator = (key: MessageKey, params?: Params) => string;
export function translator(lang: Lang): Translator {
  return (key, params) => t(lang, key, params);
}
