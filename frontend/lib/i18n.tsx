"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DISTRICT_ML, LANG_COOKIE, STRINGS, type Lang, type Strings } from "./strings";

type Ctx = { lang: Lang; t: Strings; setLang: (l: Lang) => void; district: (name: string) => string; place: (en: string, ml?: string) => string };

const LangContext = createContext<Ctx>({
  lang: "en", t: STRINGS.en, setLang: () => {}, district: n => n, place: n => n,
});

/** Language for the public side. The choice is kept in a cookie so the server renders the same language. */
export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  const value = useMemo<Ctx>(() => ({
    lang, t: STRINGS[lang], setLang,
    district: name => (lang === "ml" && DISTRICT_ML[name]) || name,
    place: (en, ml) => (lang === "ml" && ml) || en,
  }), [lang, setLang]);
  // The language applies to this subtree only, so :lang(ml) styles work from the first server render.
  return <LangContext.Provider value={value}><div lang={lang} className="contents">{children}</div></LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
