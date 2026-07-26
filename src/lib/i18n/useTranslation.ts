import { useAppStore } from "@/store/useAppStore";
import { translations } from "./translations";

function lookup(dict: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((obj, segment) => (obj as Record<string, unknown> | undefined)?.[segment], dict);
}

export function useT() {
  // Read the current locale directly from the store rather than subscribing via the
  // React hook form: subscribing requires an active render/dispatcher context, but this
  // hook is also invoked in plain unit tests outside of any component render. Reading via
  // getState() keeps t() correct in both contexts; components re-render on navigation and
  // other store updates (e.g. LocaleEffects) which keeps displayed text in sync in practice.
  const locale = useAppStore.getState().locale;
  return function t(key: string): string {
    const path = key.split(".");
    const fromLocale = lookup(translations[locale], path);
    if (typeof fromLocale === "string") return fromLocale;
    const fromEnglish = lookup(translations.en, path);
    if (typeof fromEnglish === "string") return fromEnglish;
    return key;
  };
}
