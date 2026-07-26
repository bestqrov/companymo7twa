"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-2 text-sm ${
        isActive ? "bg-surface-raised text-accent" : "text-fg-muted hover:bg-surface-raised"
      }`}
    >
      {label}
    </Link>
  );
}
