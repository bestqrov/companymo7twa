"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "ar", label: "Arabic" },
];

export function LanguageSwitcher() {
  const { currentProject } = useAppStore();
  const [targetLanguage, setTargetLanguage] = useState("en");

  useEffect(() => {
    if (!currentProject) return;
    fetch(`/api/settings?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.targetLanguage) {
          setTargetLanguage(data.targetLanguage);
        }
      })
      .catch((err) => console.error("Failed to load target language:", err));
  }, [currentProject]);

  if (!currentProject) {
    return null;
  }

  async function updateLanguage(code: string) {
    setTargetLanguage(code);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject!.id, targetLanguage: code }),
      });
      if (!res.ok) {
        console.error("Failed to save target language:", res.status, await res.text());
      }
    } catch (error) {
      console.error("Failed to save target language:", error);
    }
  }

  return (
    <select
      aria-label="Target language"
      value={targetLanguage}
      onChange={(e) => updateLanguage(e.target.value)}
      className="rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-fg"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
