"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { EditableChipList } from "@/components/descriptionTags/EditableChipList";
import { YOUTUBE_CATEGORIES } from "@/lib/youtubeCategories";
import { useT } from "@/lib/i18n/useTranslation";

interface DescriptionTagSet {
  id: string;
  ideaId: string | null;
  topic: string;
  description: string;
  tags: string[];
  hashtags: string[];
  category: string;
  pinnedComment: string;
}

export default function DescriptionTagsPage() {
  const t = useT();
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;

  const [topic, setTopic] = useState("");
  const [set, setSet] = useState<DescriptionTagSet | null>(null);
  const [revision, setRevision] = useState(0);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [pinnedCommentDraft, setPinnedCommentDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTopic("");
    setSet(null);
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/description-tags?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const sets: DescriptionTagSet[] = data.descriptionTagSets ?? [];
        if (selectedIdeaId) {
          const existing = sets.find((s) => s.ideaId === selectedIdeaId);
          if (existing) {
            setSet(existing);
            setRevision((r) => r + 1);
          }
        }
      })
      .catch((err) => console.error("Failed to load description & tags sets:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || set) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(idea.title);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, set]);

  useEffect(() => {
    setDescriptionDraft(set?.description ?? "");
    setPinnedCommentDraft(set?.pinnedComment ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/description-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setSet(data.descriptionTagSet);
        setRevision((r) => r + 1);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("descriptionTags.errorGenerateFailed"));
      }
    } catch (err) {
      console.error("Failed to generate metadata:", err);
      setError(t("descriptionTags.errorGenerateFailed"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveField(field: string, value: string | string[]) {
    if (!set) return;
    try {
      const res = await fetch(`/api/description-tags/${set.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      if (res.ok) {
        const data = await res.json();
        setSet(data.descriptionTagSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("descriptionTags.errorSaveFailed"));
      }
    } catch (err) {
      console.error("Failed to save changes:", err);
      setError(t("descriptionTags.errorSaveFailed"));
    }
  }

  async function regenerate() {
    if (!set) return;
    setIsRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/description-tags/${set.id}/regenerate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSet(data.descriptionTagSet);
        setRevision((r) => r + 1);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("descriptionTags.errorRegenerateFailed"));
      }
    } catch (err) {
      console.error("Failed to regenerate metadata:", err);
      setError(t("descriptionTags.errorRegenerateFailed"));
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-fg">{t("descriptionTags.title")}</h1>
      <p className="mt-1 text-sm text-fg-subtle">
        {t("descriptionTags.subtitle")}
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-fg-faint">{t("common.loading")}</p>
      ) : set ? (
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg-subtle">{t("descriptionTags.topicLabel")} {set.topic}</p>
            <button
              onClick={regenerate}
              disabled={isRegenerating}
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-fg-muted hover:text-accent disabled:opacity-50"
            >
              {isRegenerating ? t("common.regenerating") : t("common.regenerate")}
            </button>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-fg-faint">{t("descriptionTags.descriptionLabel")}</p>
            <textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onBlur={() => {
                if (descriptionDraft !== set.description) {
                  saveField("description", descriptionDraft);
                }
              }}
              rows={6}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
            />
          </div>

          <EditableChipList
            key={`tags-${revision}`}
            label={t("descriptionTags.tagsLabel")}
            chips={set.tags}
            onSave={(chips) => saveField("tags", chips)}
            placeholder={`${t("editableChipList.addPrefix")} ${t("descriptionTags.tagsLabel").toLowerCase()}...`}
          />
          <EditableChipList
            key={`hashtags-${revision}`}
            label={t("descriptionTags.hashtagsLabel")}
            chips={set.hashtags}
            onSave={(chips) => saveField("hashtags", chips)}
            placeholder={`${t("editableChipList.addPrefix")} ${t("descriptionTags.hashtagsLabel").toLowerCase()}...`}
          />

          <div>
            <p className="text-[10px] uppercase tracking-wide text-fg-faint">{t("descriptionTags.categoryLabel")}</p>
            <select
              value={set.category}
              onChange={(e) => saveField("category", e.target.value)}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
            >
              {YOUTUBE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-fg-faint">{t("descriptionTags.pinnedCommentLabel")}</p>
            <textarea
              value={pinnedCommentDraft}
              onChange={(e) => setPinnedCommentDraft(e.target.value)}
              onBlur={() => {
                if (pinnedCommentDraft !== set.pinnedComment) {
                  saveField("pinnedComment", pinnedCommentDraft);
                }
              }}
              rows={2}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
            />
          </div>
        </div>
      ) : (
        <>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("descriptionTags.placeholderTopic")}
            className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
          />
          <button
            onClick={generate}
            disabled={isGenerating || !currentProject || !topic.trim()}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? t("common.generating") : t("descriptionTags.generateButton")}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
