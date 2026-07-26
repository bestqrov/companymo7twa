import { useAppStore, type Locale } from "@/store/useAppStore";
import { translations } from "./translations";

function lookup(dict: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((obj, segment) => (obj as Record<string, unknown> | undefined)?.[segment], dict);
}

export function translate(locale: Locale, key: string): string {
  const path = key.split(".");
  const fromLocale = lookup(translations[locale], path);
  if (typeof fromLocale === "string") return fromLocale;
  const fromEnglish = lookup(translations.en, path);
  if (typeof fromEnglish === "string") return fromEnglish;
  return key;
}

export function useT() {
  const locale = useAppStore((state) => state.locale);
  return (key: string) => translate(locale, key);
}
