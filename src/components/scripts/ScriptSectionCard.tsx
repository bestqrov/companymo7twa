"use client";

import { useEffect, useState } from "react";

export interface Script {
  id: string;
  ideaId: string | null;
  topic: string;
  tone: "ENGAGING" | "EDUCATIONAL" | "STORYTELLING" | "FAST_PACED";
  hook: string;
  intro: string;
  mainContent: string;
  cta: string;
  ending: string;
}

export type ScriptSectionKey = "hook" | "intro" | "mainContent" | "cta" | "ending";

const SECTION_LABELS: Record<ScriptSectionKey, string> = {
  hook: "Hook",
  intro: "Intro",
  mainContent: "Main Content",
  cta: "CTA",
  ending: "Ending",
};

export function ScriptSectionCard({
  section,
  value,
  onSave,
  onRegenerate,
}: {
  section: ScriptSectionKey;
  value: string;
  onSave: (section: ScriptSectionKey, content: string) => void;
  onRegenerate: (section: ScriptSectionKey) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await onRegenerate(section);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">{SECTION_LABELS[section]}</h3>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="rounded-md border border-surface-border px-2 py-1 text-xs text-fg-muted hover:text-accent disabled:opacity-50"
        >
          {isRegenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) {
            onSave(section, text);
          }
        }}
        rows={section === "mainContent" ? 8 : 3}
        className="mt-2 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
      />
    </div>
  );
}
