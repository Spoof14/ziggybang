"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LANG_COOKIE, LANG_STORAGE_KEY, resolveLang, syncLangParam, DEFAULT_LANG, type Lang } from "./lang";
import { t as translate, type MessageKey, type Params } from "./index";

type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, params?: Params) => string;
};

const fallback: I18n = {
  lang: DEFAULT_LANG,
  setLang: () => undefined,
  t: (key, params) => translate(DEFAULT_LANG, key, params),
};

const Context = createContext<I18n>(fallback);

function persistLang(lang: Lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* private mode */
  }
  // Lets the server render the right language on a bare "/" (and <html lang>).
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

/** Writes `?lang=ko` into the address bar (removed for English), keeping every other param. */
function writeLangToUrl(lang: Lang) {
  const search = syncLangParam(window.location.search, lang);
  if (search === window.location.search) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${search}${window.location.hash}`,
  );
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function LangProvider({
  children,
  initialLang = DEFAULT_LANG,
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Resolve ?lang= / localStorage after hydration so server and client markup agree.
  useEffect(() => {
    const next = resolveLang({ search: window.location.search, stored: readStored() ?? initialLang });
    setLangState(next);
    persistLang(next);
    // A stored Korean choice on a bare link still produces a shareable ?lang=ko URL.
    writeLangToUrl(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    // The home page title follows the language (listing pages get theirs from the server).
    if (window.location.pathname === "/") document.title = translate(lang, "app.title");
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    persistLang(next);
    writeLangToUrl(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  return useContext(Context);
}
