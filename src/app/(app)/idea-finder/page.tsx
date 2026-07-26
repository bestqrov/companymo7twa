"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { IdeaCard, type Idea } from "@/components/idea-finder/IdeaCard";

export default function IdeaFinderPage() {
  const { currentProject } = useAppStore();
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
      setGenerateError("Channel Topic, Primary Niche, and Target Audience are required.");
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
        setGenerateError(data?.error ?? "Failed to generate ideas. Please try again.");
      }
    } catch (error) {
      console.error("Failed to generate ideas:", error);
      setGenerateError("Failed to generate ideas. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-fg">Idea Finder</h1>
      <p className="mt-1 text-sm text-fg-subtle">Turn a topic into scored video concepts.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <input
          value={channelTopic}
          onChange={(e) => setChannelTopic(e.target.value)}
          placeholder="Channel Topic"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
        <input
          value={primaryNiche}
          onChange={(e) => setPrimaryNiche(e.target.value)}
          placeholder="Primary Niche"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
        <input
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="Target Audience"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
        <input
          value={inspirationChannel}
          onChange={(e) => setInspirationChannel(e.target.value)}
          placeholder="Inspiration Channel (optional)"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
      </div>
      <button
        onClick={generateIdeas}
        disabled={isGenerating || !currentProject}
        className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {isGenerating ? "Generating..." : "Generate Ideas"}
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
