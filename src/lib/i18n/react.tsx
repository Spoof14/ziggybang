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
import { LANG_STORAGE_KEY, resolveLang, syncLangParam, DEFAULT_LANG, type Lang } from "./lang";
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
    const next = resolveLang({ search: window.location.search, stored: readStored() });
    setLangState(next);
    if (new URLSearchParams(window.location.search).has("lang")) {
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        /* private mode */
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    const search = syncLangParam(window.location.search, next);
    if (search !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${search}${window.location.hash}`,
      );
    }
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
