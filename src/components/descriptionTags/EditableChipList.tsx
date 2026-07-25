"use client";

import { useEffect, useState } from "react";

export function EditableChipList({
  label,
  chips,
  onSave,
}: {
  label: string;
  chips: string[];
  onSave: (chips: string[]) => void;
}) {
  const [localChips, setLocalChips] = useState(chips);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setLocalChips(chips);
  }, [chips]);

  function removeChip(index: number) {
    const next = localChips.filter((_, i) => i !== index);
    setLocalChips(next);
    onSave(next);
  }

  function addChip() {
    const trimmed = draft.trim();
    if (!trimmed || localChips.includes(trimmed)) return;
    const next = [...localChips, trimmed];
    setLocalChips(next);
    onSave(next);
    setDraft("");
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {localChips.map((chip, index) => (
          <span
            key={index}
            className="flex items-center gap-1 rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-xs text-zinc-300"
          >
            {chip}
            <button type="button" onClick={() => removeChip(index)} className="text-zinc-500 hover:text-red-400">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          placeholder={`Add ${label.toLowerCase()}...`}
          className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100"
        />
      </div>
    </div>
  );
}
