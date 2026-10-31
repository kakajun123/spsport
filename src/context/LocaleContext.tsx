import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "../lib/types";
import { translations } from "../lib/i18n";

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const Ctx = createContext<LocaleCtx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(
    localStorage.getItem("locale") === "zh" ? "zh" : "en"
  );

  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);

  const value: LocaleCtx = {
    locale,
    setLocale: (l) => {
      localStorage.setItem("locale", l);
      setLocale(l);
    },
    t: (key) => translations[locale][key] ?? translations.en[key] ?? key,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
