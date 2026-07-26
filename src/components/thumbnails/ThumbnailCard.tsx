"use client";

import { useT } from "@/lib/i18n/useTranslation";

export interface Thumbnail {
  id: string;
  imageUrl: string;
  ctrEstimate: number;
  ctrSource: "HIGGSFIELD_PREDICTOR" | "AI_ESTIMATE";
}

function ctrColor(ctr: number): string {
  if (ctr >= 7) return "#4ade80";
  if (ctr >= 4) return "#f97316";
  return "#f87171";
}

export function ThumbnailCard({
  thumbnail,
  onSaveToDrive,
}: {
  thumbnail: Thumbnail;
  onSaveToDrive: (id: string) => void;
}) {
  const t = useT();

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
      <div className="relative aspect-video overflow-hidden rounded-md bg-surface">
        <img src={thumbnail.imageUrl} alt="Generated thumbnail" className="h-full w-full object-cover" />
        <span
          className="absolute end-2 top-2 rounded px-2 py-0.5 text-[10px] font-bold text-zinc-900"
          style={{ backgroundColor: ctrColor(thumbnail.ctrEstimate) }}
        >
          {t("thumbnailCard.ctrLabel")} {thumbnail.ctrEstimate}%
        </span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-fg-faint">
        {thumbnail.ctrSource === "HIGGSFIELD_PREDICTOR" ? t("thumbnailCard.higgsfield") : t("thumbnailCard.aiEstimate")}
      </p>
      <div className="mt-2 flex gap-2">
        <a
          href={thumbnail.imageUrl}
          download
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent"
        >
          {t("thumbnailCard.download")}
        </a>
        <button
          onClick={() => onSaveToDrive(thumbnail.id)}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent"
        >
          {t("thumbnailCard.saveToDrive")}
        </button>
      </div>
    </div>
  );
}
