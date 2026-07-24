"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { ScriptSectionCard, type Script, type ScriptSectionKey } from "@/components/scripts/ScriptSectionCard";

const TONES: Script["tone"][] = ["ENGAGING", "EDUCATIONAL", "STORYTELLING", "FAST_PACED"];
const SECTION_ORDER: ScriptSectionKey[] = ["hook", "intro", "mainContent", "cta", "ending"];

export default function ScriptWriterPage() {
  const { currentProject } = useAppStore();
  const selectedIdeaId = useWorkflowStore((state) => state.selectedIdeaId);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Script["tone"]>("ENGAGING");
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScript(null);
    setTopic("");
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/scripts?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const scripts: Script[] = data.scripts ?? [];
        if (selectedIdeaId) {
          const existing = scripts.find((s) => s.ideaId === selectedIdeaId);
          if (existing) {
            setScript(existing);
          }
        }
      })
      .catch((err) => console.error("Failed to load scripts:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || script) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(`${idea.title} — ${idea.hook}`);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, script]);

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic, tone }),
      });
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate script. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate script:", err);
      setError("Failed to generate script. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveSection(section: ScriptSectionKey, content: string) {
    if (!script) return;
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, content }),
      });
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      } else {
        console.error("Failed to save section:", res.status);
      }
    } catch (err) {
      console.error("Failed to save section:", err);
    }
  }

  async function regenerateSection(section: ScriptSectionKey) {
    if (!script) return;
    try {
      const res = await fetch(`/api/scripts/${script.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to regenerate section. Please try again.");
      }
    } catch (err) {
      console.error("Failed to regenerate section:", err);
      setError("Failed to regenerate section. Please try again.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Script Writer</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate a structured video script with Hook, Intro, Main Content, CTA, and Ending.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading...</p>
      ) : script ? (
        <div className="mt-6 space-y-4">
          {SECTION_ORDER.map((section) => (
            <ScriptSectionCard
              key={section}
              section={section}
              value={script[section]}
              onSave={saveSection}
              onRegenerate={regenerateSection}
            />
          ))}
        </div>
      ) : (
        <>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Video topic..."
            className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
          />
          <div className="mt-3 flex w-fit overflow-hidden rounded-md border border-surface-border">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`px-3 py-1.5 text-xs ${tone === t ? "bg-accent text-zinc-900" : "text-zinc-300"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={isGenerating || !currentProject || !topic.trim()}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Script"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
