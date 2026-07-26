"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

export function LocaleEffects() {
  const locale = useAppStore((state) => state.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  return null;
}
