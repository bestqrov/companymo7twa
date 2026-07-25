"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useWorkflowStore } from "@/store/useWorkflowStore";
import { EditableChipList } from "@/components/descriptionTags/EditableChipList";

// Duplicated from src/server/descriptionTags.ts's YOUTUBE_CATEGORIES: that module
// imports `@/lib/prisma`, which is server-only and cannot be imported into this
// client component.
const YOUTUBE_CATEGORIES = [
  "Film & Animation",
  "Autos & Vehicles",
  "Music",
  "Pets & Animals",
  "Sports",
  "Travel & Events",
  "Gaming",
  "People & Blogs",
  "Comedy",
  "Entertainment",
  "News & Politics",
  "Howto & Style",
  "Education",
  "Science & Technology",
  "Nonprofits & Activism",
];

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
  const { currentProject } = useAppStore();
  const ideaIdFromUrl = useSearchParams().get("ideaId");
  const ideaIdFromStore = useWorkflowStore((state) => state.selectedIdeaId);
  const selectedIdeaId = ideaIdFromUrl ?? ideaIdFromStore;

  const [topic, setTopic] = useState("");
  const [set, setSet] = useState<DescriptionTagSet | null>(null);
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
  }, [set]);

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
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to generate metadata. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate metadata:", err);
      setError("Failed to generate metadata. Please try again.");
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
        setError(data?.error ?? "Failed to save changes. Please try again.");
      }
    } catch (err) {
      console.error("Failed to save changes:", err);
      setError("Failed to save changes. Please try again.");
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
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to regenerate metadata. Please try again.");
      }
    } catch (err) {
      console.error("Failed to regenerate metadata:", err);
      setError("Failed to regenerate metadata. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-100">Description & Tags</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate a full metadata package: description, tags, hashtags, category, and a pinned-comment suggestion.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading...</p>
      ) : set ? (
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Topic: {set.topic}</p>
            <button
              onClick={regenerate}
              disabled={isRegenerating}
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-zinc-300 hover:text-accent disabled:opacity-50"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Description</p>
            <textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onBlur={() => {
                if (descriptionDraft !== set.description) {
                  saveField("description", descriptionDraft);
                }
              }}
              rows={6}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <EditableChipList label="Tags" chips={set.tags} onSave={(chips) => saveField("tags", chips)} />
          <EditableChipList label="Hashtags" chips={set.hashtags} onSave={(chips) => saveField("hashtags", chips)} />

          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Category</p>
            <select
              value={set.category}
              onChange={(e) => saveField("category", e.target.value)}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
            >
              {YOUTUBE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Pinned Comment</p>
            <textarea
              value={pinnedCommentDraft}
              onChange={(e) => setPinnedCommentDraft(e.target.value)}
              onBlur={() => {
                if (pinnedCommentDraft !== set.pinnedComment) {
                  saveField("pinnedComment", pinnedCommentDraft);
                }
              }}
              rows={2}
              className="mt-2 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
            />
          </div>
        </div>
      ) : (
        <>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Video topic..."
            className="mt-4 w-full rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
          />
          <button
            onClick={generate}
            disabled={isGenerating || !currentProject || !topic.trim()}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Metadata"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
