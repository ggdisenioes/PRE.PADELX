"use client";

import { useTranslation } from "../i18n";
import type { Locale } from "../i18n/types";

const LANGUAGES: { code: Locale; label: string; flag: string }[] = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export default function LanguageSelector() {
  const { locale, setLocale } = useTranslation();

  return (
    <div className="flex items-center gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLocale(lang.code)}
          data-testid={`lang-${lang.code}`}
          className={`px-2 py-1 rounded text-sm transition ${
            locale === lang.code
              ? "bg-[#00b4ff]/20 text-[#00b4ff] ring-1 ring-[#00b4ff]/40"
              : "text-gray-400 hover:text-white hover:bg-white/10"
          }`}
          title={lang.label}
        >
          {lang.flag}
        </button>
      ))}
    </div>
  );
}
