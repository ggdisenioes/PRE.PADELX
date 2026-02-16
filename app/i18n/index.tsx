"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Locale } from "./types";

import es from "./locales/es.json";
import en from "./locales/en.json";

const dictionaries: Record<Locale, Record<string, unknown>> = { es, en };

const STORAGE_KEY = "padelx-locale";
const DEFAULT_LOCALE: Locale = "es";

type I18nContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getInitialLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      let value = getNestedValue(dict as Record<string, unknown>, key);

      // Fallback to Spanish if key missing in current locale
      if (value === undefined && locale !== DEFAULT_LOCALE) {
        value = getNestedValue(
          dictionaries[DEFAULT_LOCALE] as Record<string, unknown>,
          key
        );
      }

      // Fallback to key itself if not found anywhere
      if (value === undefined) return key;

      // Simple parameter interpolation: "Hello {{name}}" -> "Hello World"
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(
            new RegExp(`\\{\\{${k}\\}\\}`, "g"),
            String(v)
          );
        }
      }

      return value;
    },
    [locale]
  );

  // Avoid hydration mismatch: render with default locale until mounted
  if (!mounted) {
    const defaultT = (key: string, params?: Record<string, string | number>) => {
      let value =
        getNestedValue(
          dictionaries[DEFAULT_LOCALE] as Record<string, unknown>,
          key
        ) ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(
            new RegExp(`\\{\\{${k}\\}\\}`, "g"),
            String(v)
          );
        }
      }
      return value;
    };
    return (
      <I18nContext.Provider value={{ locale: DEFAULT_LOCALE, setLocale, t: defaultT }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx)
    throw new Error("useTranslation must be used inside <LanguageProvider>");
  return ctx;
}
