"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function SettingsPage() {
  const { currentProject } = useAppStore();
  const [youtubeApiKey, setYoutubeApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [targetCountry, setTargetCountry] = useState("US");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!currentProject) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: currentProject.id, youtubeApiKey, targetCountry, targetLanguage }),
    });

    if (res.ok) {
      setYoutubeApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      console.error("Failed to save settings:", res.status);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-fg">Settings</h1>

      <div className="rounded-md border border-surface-border bg-surface-raised p-4 text-sm text-fg-subtle">
        Without a YouTube API key, Idea Finder falls back to heuristic AI-generated ideas instead of
        real search-trend data.
      </div>

      <div>
        <label className="block text-sm font-medium text-fg-muted">YouTube Data API Key</label>
        <div className="mt-1 flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            value={youtubeApiKey}
            onChange={(e) => setYoutubeApiKey(e.target.value)}
            placeholder="Enter to update — leave blank to keep current key"
            className="flex-1 rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="rounded-md border border-surface-border px-3 text-sm text-fg-muted"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-fg-muted">Target Country</label>
          <select
            value={targetCountry}
            onChange={(e) => setTargetCountry(e.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
          >
            <option value="US">United States</option>
            <option value="MA">Morocco</option>
            <option value="FR">France</option>
            <option value="GB">United Kingdom</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-muted">Target Language</label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
      </div>

      <button
        onClick={save}
        disabled={!currentProject}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {saved ? "Saved" : "Save Settings"}
      </button>
    </div>
  );
}
