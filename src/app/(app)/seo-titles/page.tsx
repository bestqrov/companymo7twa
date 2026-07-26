"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { useT } from "@/lib/i18n/useTranslation";

interface TitleSet {
  id: string;
  ideaId: string | null;
  topic: string;
  titles: string[];
  keywords: string[];
  selectedTitle: string | null;
}

export default function SeoTitlesPage() {
  const t = useT();
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;

  const [topic, setTopic] = useState("");
  const [titleSet, setTitleSet] = useState<TitleSet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTopic("");
    setTitleSet(null);
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/titles?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const titleSets: TitleSet[] = data.titleSets ?? [];
        if (selectedIdeaId) {
          const existing = titleSets.find((t) => t.ideaId === selectedIdeaId);
          if (existing) {
            setTitleSet(existing);
          }
        }
      })
      .catch((err) => console.error("Failed to load title sets:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || titleSet) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(idea.title);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, titleSet]);

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setTitleSet(data.titleSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("seoTitles.errorGenerateFailed"));
      }
    } catch (err) {
      console.error("Failed to generate titles:", err);
      setError(t("seoTitles.errorGenerateFailed"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function selectTitle(title: string) {
    if (!titleSet) return;
    try {
      const res = await fetch(`/api/titles/${titleSet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTitle: title }),
      });
      if (res.ok) {
        const data = await res.json();
        setTitleSet(data.titleSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("seoTitles.errorSelectFailed"));
      }
    } catch (err) {
      console.error("Failed to select title:", err);
      setError(t("seoTitles.errorSelectFailed"));
    }
  }

  async function regenerate() {
    if (!titleSet) return;
    setIsRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/titles/${titleSet.id}/regenerate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setTitleSet(data.titleSet);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("seoTitles.errorRegenerateFailed"));
      }
    } catch (err) {
      console.error("Failed to regenerate titles:", err);
      setError(t("seoTitles.errorRegenerateFailed"));
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-fg">{t("seoTitles.title")}</h1>
      <p className="mt-1 text-sm text-fg-subtle">
        {t("seoTitles.subtitle")}
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-fg-faint">{t("common.loading")}</p>
      ) : titleSet ? (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg-subtle">{t("seoTitles.topicLabel")} {titleSet.topic}</p>
            <button
              onClick={regenerate}
              disabled={isRegenerating}
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-fg-muted hover:text-accent disabled:opacity-50"
            >
              {isRegenerating ? t("common.regenerating") : t("common.regenerate")}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {titleSet.titles.map((title) => (
              <button
                key={title}
                onClick={() => selectTitle(title)}
                className={`block w-full rounded-md border px-3 py-2 text-start text-sm ${
                  titleSet.selectedTitle === title
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-surface-border bg-surface-raised text-fg-muted hover:text-accent"
                }`}
              >
                {titleSet.selectedTitle === title ? "✓ " : ""}
                {title}
              </button>
            ))}
          </div>

          <p className="mt-6 text-[10px] uppercase tracking-wide text-fg-faint">{t("seoTitles.keywordsLabel")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {titleSet.keywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-xs text-fg-muted"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("seoTitles.placeholderTopic")}
            className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
          />
          <button
            onClick={generate}
            disabled={isGenerating || !currentProject || !topic.trim()}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? t("common.generating") : t("seoTitles.researchButton")}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
