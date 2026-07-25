"use client";

import { useWorkflowStore } from "@/store/useWorkflowStore";

export interface Idea {
  id: string;
  title: string;
  description: string;
  hook: string;
  viralityScore: number;
  scoreSource: "REAL_YOUTUBE_DATA" | "AI_ESTIMATE";
}

const IDEA_ACTIONS = [
  { icon: "📄", label: "Script Writer", href: "/script-writer" },
  { icon: "T", label: "SEO Titles", href: "/seo-titles" },
  { icon: "🔍", label: "Keyword Research", href: "/keyword-research" },
  { icon: "🏷️", label: "Description & Tags", href: "/description-tags" },
  { icon: "🖼️", label: "Thumbnails", href: "/thumbnails" },
  { icon: "📱", label: "Multi-Platform Shorts", href: "/multi-platform-shorts" },
];

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#f97316";
  return "#f87171";
}

export function IdeaCard({ idea }: { idea: Idea }) {
  const setSelectedIdeaId = useWorkflowStore((state) => state.setSelectedIdeaId);

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-start justify-between">
        <span className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-200">
          {idea.scoreSource === "REAL_YOUTUBE_DATA" ? "REAL YOUTUBE DATA" : "AI ESTIMATE"}
        </span>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold"
          style={{ borderColor: scoreColor(idea.viralityScore), color: scoreColor(idea.viralityScore) }}
        >
          {idea.viralityScore}
        </div>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-zinc-100">{idea.title}</h3>
      <p className="mt-1 text-xs text-zinc-400">{idea.description}</p>
      <div className="mt-2 rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-zinc-300">
        <span className="font-semibold">Hook:</span> {idea.hook}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-wide text-zinc-500">Use this idea in</p>
      <div className="mt-1 flex gap-2">
        {IDEA_ACTIONS.map((action) => (
          <a
            key={action.href}
            href={`${action.href}?ideaId=${idea.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={action.label}
            aria-label={action.label}
            onClick={() => setSelectedIdeaId(idea.id)}
            className="rounded-md border border-surface-border px-2 py-1 text-sm text-zinc-300 hover:text-accent"
          >
            {action.icon}
          </a>
        ))}
      </div>
    </div>
  );
}
