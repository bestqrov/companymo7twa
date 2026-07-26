const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  ar: "Arabic",
};

export function resolveLanguageName(code: string | null | undefined): string {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? "English";
}
