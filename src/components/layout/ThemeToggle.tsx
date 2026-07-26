"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useTranslation";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const t = useT();

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch (error) {
      console.error("Failed to persist theme preference:", error);
    }
  }

  const label = isDark ? t("ariaLabels.switchToLightMode") : t("ariaLabels.switchToDarkMode");

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-fg hover:text-accent"
    >
      {isDark ? "🌙" : "☀️"}
    </button>
  );
}
