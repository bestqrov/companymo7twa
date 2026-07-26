"use client";

import { useT } from "@/lib/i18n/useTranslation";

export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-surface-border py-24 text-center">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-fg-faint">
        {t("placeholderPage.comingSoonPrefix")} {phase}.
      </p>
    </div>
  );
}
