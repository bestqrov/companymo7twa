import { SidebarNavItem } from "./SidebarNavItem";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { LanguageSwitcher } from "./LanguageSwitcher";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/idea-finder", label: "Idea Finder" },
  { href: "/script-writer", label: "Script Writer" },
  { href: "/seo-titles", label: "SEO Titles" },
  { href: "/keyword-research", label: "Keyword Research" },
  { href: "/description-tags", label: "Description & Tags" },
  { href: "/thumbnails", label: "Thumbnails & A/B Test" },
  { href: "/multi-platform-shorts", label: "Multi-Platform Shorts" },
  { href: "/one-click-publish", label: "One-Click Publish" },
  { href: "/projects", label: "Projects" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-surface-border bg-surface p-4">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-accent">ArwaTube AI</h1>
      </div>
      <div className="mb-4">
        <ProjectSwitcher />
      </div>
      <div className="mb-4">
        <LanguageSwitcher />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
      <div className="mt-4 shrink-0 border-t border-surface-border pt-4">
        <SidebarNavItem href="/settings" label="Settings" />
      </div>
    </aside>
  );
}
