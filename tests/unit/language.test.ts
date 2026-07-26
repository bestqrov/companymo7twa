import { describe, it, expect } from "vitest";
import { resolveLanguageName } from "@/lib/language";

describe("resolveLanguageName", () => {
  it("resolves 'en' to English", () => {
    expect(resolveLanguageName("en")).toBe("English");
  });

  it("resolves 'fr' to French", () => {
    expect(resolveLanguageName("fr")).toBe("French");
  });

  it("resolves 'ar' to Arabic", () => {
    expect(resolveLanguageName("ar")).toBe("Arabic");
  });

  it("defaults to English for null", () => {
    expect(resolveLanguageName(null)).toBe("English");
  });

  it("defaults to English for undefined", () => {
    expect(resolveLanguageName(undefined)).toBe("English");
  });

  it("defaults to English for an unrecognized code", () => {
    expect(resolveLanguageName("xx")).toBe("English");
  });
});
