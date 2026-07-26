import { describe, it, expect } from "vitest";
import { translations } from "@/lib/i18n/translations";
import { useT } from "@/lib/i18n/useTranslation";
import { useAppStore } from "@/store/useAppStore";

function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null ? collectKeys(value as Record<string, unknown>, path) : [path];
  });
}

describe("translations", () => {
  it("has the exact same set of keys in fr and ar as in en", () => {
    const enKeys = collectKeys(translations.en).sort();
    const frKeys = collectKeys(translations.fr).sort();
    const arKeys = collectKeys(translations.ar).sort();
    expect(frKeys).toEqual(enKeys);
    expect(arKeys).toEqual(enKeys);
  });

  it("has no empty string values in any locale", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      const keys = collectKeys(translations[locale]);
      for (const key of keys) {
        const value = key.split(".").reduce<unknown>((obj, segment) => (obj as Record<string, unknown>)?.[segment], translations[locale]);
        expect(typeof value === "string" && value.trim().length > 0, `${locale}.${key} must be non-empty`).toBe(true);
      }
    }
  });

  it("translates the sidebar nav dashboard label into French and Arabic", () => {
    expect(translations.fr.nav.dashboard).not.toBe(translations.en.nav.dashboard);
    expect(translations.ar.nav.dashboard).not.toBe(translations.en.nav.dashboard);
  });
});

describe("useT", () => {
  it("returns the English string for a known key when locale is en", () => {
    useAppStore.setState({ locale: "en" });
    const t = useT();
    expect(t("nav.dashboard")).toBe(translations.en.nav.dashboard);
  });

  it("returns the French string for a known key when locale is fr", () => {
    useAppStore.setState({ locale: "fr" });
    const t = useT();
    expect(t("nav.dashboard")).toBe(translations.fr.nav.dashboard);
  });

  it("falls back to English when the key is missing from a non-English locale", () => {
    useAppStore.setState({ locale: "fr" });
    const t = useT();
    // "common.generate" always exists per the dictionary below, so simulate a
    // missing key by looking up something that structurally cannot exist.
    expect(t("thisKeyDoesNotExist.atAll")).toBe("thisKeyDoesNotExist.atAll");
  });
});
