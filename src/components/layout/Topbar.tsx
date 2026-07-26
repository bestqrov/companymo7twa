"use client";

import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useT } from "@/lib/i18n/useTranslation";

const PATH_TO_NAV_KEY: Record<string, string> = {
  dashboard: "nav.dashboard",
  "idea-finder": "nav.ideaFinder",
  "script-writer": "nav.scriptWriter",
  "seo-titles": "nav.seoTitles",
  "keyword-research": "nav.keywordResearch",
  "description-tags": "nav.descriptionTags",
  thumbnails: "nav.thumbnails",
  "multi-platform-shorts": "nav.multiPlatformShorts",
  "one-click-publish": "nav.oneClickPublish",
  projects: "nav.projects",
  settings: "nav.settings",
};

export function Topbar() {
  const pathname = usePathname();
  const t = useT();
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const navKey = PATH_TO_NAV_KEY[segment] ?? "nav.dashboard";

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface px-6">
      <h2 className="text-sm font-medium text-fg-muted">{t(navKey)}</h2>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
