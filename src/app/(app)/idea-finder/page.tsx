"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { IdeaCard, type Idea } from "@/components/idea-finder/IdeaCard";
import { useT } from "@/lib/i18n/useTranslation";

export default function IdeaFinderPage() {
  const { currentProject } = useAppStore();
  const t = useT();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [channelTopic, setChannelTopic] = useState("");
  const [primaryNiche, setPrimaryNiche] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [inspirationChannel, setInspirationChannel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    setChannelTopic("");
    setPrimaryNiche("");
    setTargetAudience("");
    setInspirationChannel("");
    setGenerateError(null);
    setIdeas([]);
  }, [currentProject]);

  async function generateIdeas() {
    if (!currentProject) return;
    if (!channelTopic.trim() || !primaryNiche.trim() || !targetAudience.trim()) {
      setGenerateError(t("ideaFinder.errorRequiredFields"));
      return;
    }
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProject.id,
          channelTopic,
          primaryNiche,
          targetAudience,
          inspirationChannel: inspirationChannel.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas);
      } else {
        const data = await res.json().catch(() => null);
        setGenerateError(data?.error ?? t("ideaFinder.errorGenerateFailed"));
      }
    } catch (error) {
      console.error("Failed to generate ideas:", error);
      setGenerateError(t("ideaFinder.errorGenerateFailed"));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-fg">{t("ideaFinder.title")}</h1>
      <p className="mt-1 text-sm text-fg-subtle">{t("ideaFinder.subtitle")}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <input
          value={channelTopic}
          onChange={(e) => setChannelTopic(e.target.value)}
          placeholder={t("ideaFinder.placeholderChannelTopic")}
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
        <input
          value={primaryNiche}
          onChange={(e) => setPrimaryNiche(e.target.value)}
          placeholder={t("ideaFinder.placeholderPrimaryNiche")}
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
        <input
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder={t("ideaFinder.placeholderTargetAudience")}
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
        <input
          value={inspirationChannel}
          onChange={(e) => setInspirationChannel(e.target.value)}
          placeholder={t("ideaFinder.placeholderInspirationChannel")}
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
      </div>
      <button
        onClick={generateIdeas}
        disabled={isGenerating || !currentProject}
        className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {isGenerating ? t("common.generating") : t("ideaFinder.generateButton")}
      </button>
      {generateError && <p className="mt-2 text-sm text-red-400">{generateError}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </div>
    </div>
  );
}
