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
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!currentProject) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => setIdeas(data.ideas ?? []))
      .catch((error) => console.error("Failed to load ideas:", error));
  }, [currentProject]);

  async function generateIdeas() {
    if (!currentProject || !channelTopic.trim() || !primaryNiche.trim() || !targetAudience.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProject.id,
          channelTopic,
          primaryNiche,
          targetAudience,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setIdeas([...data.ideas, ...ideas]);
      } else {
        console.error("Failed to generate ideas:", res.status);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Idea Finder</h1>
      <p className="mt-1 text-sm text-zinc-400">Turn a topic into scored video concepts.</p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <input
          value={channelTopic}
          onChange={(e) => setChannelTopic(e.target.value)}
          placeholder="Channel Topic"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={primaryNiche}
          onChange={(e) => setPrimaryNiche(e.target.value)}
          placeholder="Primary Niche"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <input
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="Target Audience"
          className="rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
      </div>
      <button
        onClick={generateIdeas}
        disabled={isGenerating || !currentProject}
        className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {isGenerating ? "Generating..." : "Generate Ideas"}
      </button>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </div>
    </div>
  );
}
