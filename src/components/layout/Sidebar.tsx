"use client";

import { SidebarNavItem } from "./SidebarNavItem";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useT } from "@/lib/i18n/useTranslation";

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard" },
  { href: "/idea-finder", labelKey: "nav.ideaFinder" },
  { href: "/script-writer", labelKey: "nav.scriptWriter" },
  { href: "/seo-titles", labelKey: "nav.seoTitles" },
  { href: "/keyword-research", labelKey: "nav.keywordResearch" },
  { href: "/description-tags", labelKey: "nav.descriptionTags" },
  { href: "/thumbnails", labelKey: "nav.thumbnails" },
  { href: "/multi-platform-shorts", labelKey: "nav.multiPlatformShorts" },
  { href: "/one-click-publish", labelKey: "nav.oneClickPublish" },
  { href: "/projects", labelKey: "nav.projects" },
];

export function Sidebar() {
  const t = useT();

  return (
    <aside className="flex h-screen w-64 flex-col border-e border-surface-border bg-surface p-4">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-accent">{t("nav.appName")}</h1>
      </div>
      <div className="mb-4">
        <ProjectSwitcher />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.href} href={item.href} label={t(item.labelKey)} />
        ))}
      </nav>
      <div className="mt-4 shrink-0 border-t border-surface-border pt-4">
        <SidebarNavItem href="/settings" label={t("nav.settings")} />
      </div>
    </aside>
  );
}
