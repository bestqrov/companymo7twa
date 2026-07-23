"use client";

import { usePathname } from "next/navigation";

function titleFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function Topbar() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 items-center border-b border-surface-border bg-surface px-6">
      <h2 className="text-sm font-medium text-zinc-300">{titleFromPath(pathname)}</h2>
    </header>
  );
}
