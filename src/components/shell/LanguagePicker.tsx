"use client";

import { useLanguage } from "@/i18n/LanguageProvider";

export function LanguagePicker() {
  const { language, setLanguage } = useLanguage();
  const label = language === "nl" ? "Taal" : "Language";
  return (
    <label className="language-picker">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={language}
        onChange={(event) =>
          setLanguage(event.currentTarget.value === "nl" ? "nl" : "en")
        }
      >
        <option value="en">EN</option>
        <option value="nl">NL</option>
      </select>
    </label>
  );
}
