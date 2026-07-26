"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { PlatformVariantCard, type PlatformVariant } from "@/components/platformVariants/PlatformVariantCard";

const PLATFORM_ORDER: PlatformVariant["platform"][] = ["TIKTOK", "YOUTUBE_SHORTS", "INSTAGRAM_REELS", "FACEBOOK_REELS"];

export default function MultiPlatformShortsPage() {
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;

  const [topic, setTopic] = useState("");
  const [variants, setVariants] = useState<PlatformVariant[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTopic("");
    setVariants(null);
    setError(null);

    if (!currentProject) return;

    setIsLoading(true);
    fetch(`/api/platform-variants?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const all: PlatformVariant[] = data.platformVariants ?? [];
        if (selectedIdeaId) {
          const existing = all.filter((v) => (v as unknown as { ideaId: string | null }).ideaId === selectedIdeaId);
          if (existing.length > 0) {
            setVariants(sortByPlatform(existing));
          }
        }
      })
      .catch((err) => console.error("Failed to load platform variants:", err))
      .finally(() => setIsLoading(false));
  }, [currentProject, selectedIdeaId]);

  useEffect(() => {
    if (!selectedIdeaId || !currentProject || variants) return;
    fetch(`/api/ideas?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        const idea = (data.ideas ?? []).find((i: { id: string }) => i.id === selectedIdeaId);
        if (idea) {
          setTopic(idea.title);
        }
      })
      .catch((err) => console.error("Failed to load selected idea:", err));
  }, [selectedIdeaId, currentProject, variants]);

  function sortByPlatform(list: PlatformVariant[]): PlatformVariant[] {
    return [...list].sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
  }

  async function generate() {
    if (!currentProject || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, ideaId: selectedIdeaId, topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setVariants(sortByPlatform(data.platformVariants));
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate shorts. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate shorts:", err);
      setError("Failed to generate shorts. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveField(variantId: string, field: string, value: string | string[]) {
    try {
      const res = await fetch(`/api/platform-variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      if (res.ok) {
        const data = await res.json();
        setVariants((prev) => prev?.map((v) => (v.id === variantId ? data.platformVariant : v)) ?? null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to save changes. Please try again.");
      }
    } catch (err) {
      console.error("Failed to save changes:", err);
      setError("Failed to save changes. Please try again.");
    }
  }

  async function regenerate(variantId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/platform-variants/${variantId}/regenerate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setVariants((prev) => prev?.map((v) => (v.id === variantId ? data.platformVariant : v)) ?? null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to regenerate this variant. Please try again.");
      }
    } catch (err) {
      console.error("Failed to regenerate variant:", err);
      setError("Failed to regenerate this variant. Please try again.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-fg">Multi-Platform Shorts</h1>
      <p className="mt-1 text-sm text-fg-subtle">
        Repurpose your video concept into platform-tailored hooks, captions, and hashtags for TikTok, YouTube Shorts,
        Instagram Reels, and Facebook Reels.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-fg-faint">Loading...</p>
      ) : variants ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {variants.map((variant) => (
            <PlatformVariantCard key={variant.id} variant={variant} onSaveField={saveField} onRegenerate={regenerate} />
          ))}
        </div>
      ) : (
        <>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Video topic..."
            className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
          />
          <button
            onClick={generate}
            disabled={isGenerating || !currentProject || !topic.trim()}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Shorts"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
