"use client";

import { useEffect, useState } from "react";
import { EditableChipList } from "@/components/descriptionTags/EditableChipList";
import { useT } from "@/lib/i18n/useTranslation";

export interface PlatformVariant {
  id: string;
  platform: "TIKTOK" | "YOUTUBE_SHORTS" | "INSTAGRAM_REELS" | "FACEBOOK_REELS";
  hook: string;
  caption: string;
  hashtags: string[];
  coverImageUrl: string | null;
}

const PLATFORM_LABEL_KEYS: Record<PlatformVariant["platform"], string> = {
  TIKTOK: "platformVariantCard.platformTiktok",
  YOUTUBE_SHORTS: "platformVariantCard.platformYoutubeShorts",
  INSTAGRAM_REELS: "platformVariantCard.platformInstagramReels",
  FACEBOOK_REELS: "platformVariantCard.platformFacebookReels",
};

export function PlatformVariantCard({
  variant,
  onSaveField,
  onRegenerate,
}: {
  variant: PlatformVariant;
  onSaveField: (variantId: string, field: string, value: string | string[]) => void;
  onRegenerate: (variantId: string) => Promise<void>;
}) {
  const [hookDraft, setHookDraft] = useState(variant.hook);
  const [captionDraft, setCaptionDraft] = useState(variant.caption);
  const [revision, setRevision] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const t = useT();

  useEffect(() => {
    setHookDraft(variant.hook);
  }, [variant.hook]);

  useEffect(() => {
    setCaptionDraft(variant.caption);
  }, [variant.caption]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await onRegenerate(variant.id);
      setRevision((r) => r + 1);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">{t(PLATFORM_LABEL_KEYS[variant.platform])}</h3>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent disabled:opacity-50"
        >
          {isRegenerating ? t("common.regenerating") : t("common.regenerate")}
        </button>
      </div>

      {variant.platform === "INSTAGRAM_REELS" && variant.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variant.coverImageUrl}
          alt="Instagram Reels cover"
          className="mt-3 h-32 w-full rounded-md object-cover"
        />
      )}

      <p className="mt-3 text-[10px] uppercase tracking-wide text-fg-faint">{t("platformVariantCard.hookLabel")}</p>
      <textarea
        value={hookDraft}
        onChange={(e) => setHookDraft(e.target.value)}
        onBlur={() => {
          if (hookDraft !== variant.hook) {
            onSaveField(variant.id, "hook", hookDraft);
          }
        }}
        rows={2}
        className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
      />

      <p className="mt-3 text-[10px] uppercase tracking-wide text-fg-faint">{t("platformVariantCard.captionLabel")}</p>
      <textarea
        value={captionDraft}
        onChange={(e) => setCaptionDraft(e.target.value)}
        onBlur={() => {
          if (captionDraft !== variant.caption) {
            onSaveField(variant.id, "caption", captionDraft);
          }
        }}
        rows={3}
        className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
      />

      <div className="mt-3">
        <EditableChipList
          key={`hashtags-${revision}`}
          label={t("platformVariantCard.hashtagsLabel")}
          chips={variant.hashtags}
          onSave={(chips) => onSaveField(variant.id, "hashtags", chips)}
          placeholder={`${t("editableChipList.addPrefix")} ${t("platformVariantCard.hashtagsLabel").toLowerCase()}...`}
        />
      </div>
    </div>
  );
}
