"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { ThumbnailCard, type Thumbnail } from "@/components/thumbnails/ThumbnailCard";

export default function ThumbnailsPage() {
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"single" | "abtest">("single");
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingToDriveId, setSavingToDriveId] = useState<string | null>(null);
  const [saveToDriveMessage, setSaveToDriveMessage] = useState<string | null>(null);

  const loadThumbnails = useCallback((options?: { silent?: boolean }) => {
    if (!currentProject) {
      setThumbnails([]);
      return;
    }
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    return fetch(`/api/thumbnails?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => setThumbnails(data.thumbnails ?? []))
      .catch((err) => console.error("Failed to load thumbnails:", err))
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, [currentProject]);

  useEffect(() => {
    setPrompt("");
    setError(null);
    setThumbnails([]);
  }, [currentProject]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setPrompt(`${idea.title} — ${idea.hook}`);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject]);

  async function generate() {
    if (!currentProject || !prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProject.id,
          prompt,
          mode,
          ideaId: selectedIdeaId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setThumbnails([...data.thumbnails, ...thumbnails]);
      } else {
        const data = await res.json().catch(() => null);
        setError(
          (data?.error ?? "Failed to generate thumbnails. Please try again.") +
            " Any thumbnails generated before the failure have been saved — reloading now."
        );
        // A partial batch may have already been persisted server-side before
        // the failure (thumbnails are saved one at a time, not all-or-nothing —
        // see src/server/thumbnails.ts). Re-fetch so the user sees them instead
        // of silently losing track of already-generated (and paid-for) images.
        await loadThumbnails({ silent: true });
      }
    } catch (err) {
      console.error("Failed to generate thumbnails:", err);
      setError("Failed to generate thumbnails. Please try again. Reloading in case some were saved.");
      await loadThumbnails({ silent: true });
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveToDrive(id: string) {
    setSavingToDriveId(id);
    setSaveToDriveMessage(null);
    try {
      const res = await fetch(`/api/thumbnails/${id}/save-to-drive`, { method: "POST" });
      if (res.ok) {
        setSaveToDriveMessage("Saved to Drive.");
      } else {
        console.error("Failed to save to Drive:", res.status);
        setSaveToDriveMessage("Failed to save to Drive. Please try again.");
      }
    } catch (err) {
      console.error("Failed to save to Drive:", err);
      setSaveToDriveMessage("Failed to save to Drive. Please try again.");
    } finally {
      setSavingToDriveId(null);
      setTimeout(() => setSaveToDriveMessage(null), 3000);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Thumbnail Studio</h1>
      <p className="mt-1 text-sm text-zinc-400">Generate and A/B test thumbnails for your video.</p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the thumbnail you want..."
        rows={3}
        className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
      />

      <div className="mt-3 flex items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-surface-border">
          <button
            onClick={() => setMode("single")}
            className={`px-3 py-1.5 text-xs ${mode === "single" ? "bg-accent text-zinc-900" : "text-zinc-300"}`}
          >
            Single
          </button>
          <button
            onClick={() => setMode("abtest")}
            className={`px-3 py-1.5 text-xs ${mode === "abtest" ? "bg-accent text-zinc-900" : "text-zinc-300"}`}
          >
            A/B Test (4 variations)
          </button>
        </div>
        <button
          onClick={generate}
          disabled={isGenerating || !currentProject || !prompt.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {isRefreshing && <p className="mt-1 text-xs text-zinc-500">Checking for saved thumbnails...</p>}

      {saveToDriveMessage && <p className="mt-2 text-sm text-zinc-400">{saveToDriveMessage}</p>}

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading thumbnails...</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {thumbnails.map((thumbnail) => (
            <ThumbnailCard key={thumbnail.id} thumbnail={thumbnail} onSaveToDrive={saveToDrive} />
          ))}
        </div>
      )}
    </div>
  );
}
