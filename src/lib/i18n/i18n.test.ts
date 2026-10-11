import { describe, expect, it } from "vitest";
import { LANGS, messages, resolveLang, parseLang, syncLangParam, keepLangParam, withLangPath, resolveServerLang, t, tn, formatCount } from "./index";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe("dictionary completeness", () => {
  const enKeys = Object.keys(messages.en).sort();
  const koKeys = Object.keys(messages.ko).sort();

  it("has the same keys in every language", () => {
    expect(koKeys).toEqual(enKeys);
  });

  it("has no empty strings", () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe("");
      }
    }
  });

  it("never uses a {placeholder} in Korean that English lacks (Korean may omit plural-only ones)", () => {
    for (const key of enKeys) {
      const k = key as keyof typeof messages.en;
      const en = placeholders(messages.en[k]);
      for (const name of placeholders(messages.ko[k])) expect(en, key).toContain(name);
      // everything except explicitly plural-only helpers must appear in Korean too
      for (const name of en.filter((n) => n !== "plural")) {
        expect(placeholders(messages.ko[k]), key).toContain(name);
      }
    }
  });

  it("actually translates (Korean contains Hangul for visible strings)", () => {
    expect(t("ko", "type.oneroom")).toBe("원룸");
    expect(t("ko", "sale.jeonse")).toBe("전세");
    expect(t("ko", "sale.wolse")).toBe("월세");
    expect(t("ko", "type.officetel")).toBe("오피스텔");
    expect(/[가-힣]/.test(t("ko", "ask.find"))).toBe(true);
  });
});

describe("t / tn", () => {
  it("interpolates params", () => {
    expect(t("en", "list.homes", { n: "12" })).toBe("12 homes");
    expect(t("ko", "list.homes", { n: "12" })).toContain("12");
  });
  it("pluralizes English and not Korean", () => {
    expect(tn("en", "building.upTo", 1)).toBe("Up to 1 year old");
    expect(tn("en", "building.upTo", 5)).toBe("Up to 5 years old");
    expect(tn("ko", "building.upTo", 1)).toBe(tn("ko", "building.upTo", 5).replace("5", "1"));
  });
});

describe("language resolution", () => {
  it("defaults to English", () => {
    expect(resolveLang({})).toBe("en");
    expect(resolveLang({ search: "?q=1", stored: "fr" })).toBe("en");
  });
  it("URL param beats stored value", () => {
    expect(resolveLang({ search: "?lang=ko", stored: "en" })).toBe("ko");
    expect(resolveLang({ search: "?lang=en", stored: "ko" })).toBe("en");
  });
  it("uses stored value when no param", () => {
    expect(resolveLang({ search: "", stored: "ko" })).toBe("ko");
  });
  it("parses locales", () => {
    expect(parseLang("ko-KR")).toBe("ko");
    expect(parseLang("EN_us")).toBe("en");
    expect(parseLang("ja")).toBeNull();
  });
  it("syncs and keeps the lang param", () => {
    expect(syncLangParam("?a=1&lang=en", "ko")).toBe("?a=1&lang=ko");
    expect(syncLangParam("?a=1", "ko")).toBe("?a=1&lang=ko");
    expect(syncLangParam("", "ko")).toBe("?lang=ko");
    expect(syncLangParam("?a=1&lang=ko", "en")).toBe("?a=1");
    expect(syncLangParam("?lang=ko", "en")).toBe("");
    expect(withLangPath("/listing/a/b/c", "ko")).toBe("/listing/a/b/c?lang=ko");
    expect(withLangPath("/?z=1#x", "ko")).toBe("/?z=1&lang=ko#x");
    expect(withLangPath("/listing/a", "en")).toBe("/listing/a");
    expect(resolveServerLang(undefined, "ko")).toBe("ko");
    expect(resolveServerLang("en", "ko")).toBe("en");
    expect(resolveServerLang(["ko"], undefined)).toBe("ko");
    expect(resolveServerLang("xx", "zz")).toBe("en");
    expect(keepLangParam("?a=2", "?lang=ko")).toBe("?a=2&lang=ko");
    expect(keepLangParam("?a=2", "?x=1")).toBe("?a=2");
    expect(keepLangParam("?a=2", "?lang=en")).toBe("?a=2");
  });
  it("formats counts per locale", () => {
    expect(formatCount(1234567, "en")).toBe("1,234,567");
    expect(formatCount(1234567, "ko")).toBe("1,234,567");
  });
});
