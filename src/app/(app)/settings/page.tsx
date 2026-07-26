"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useT } from "@/lib/i18n/useTranslation";

export default function SettingsPage() {
  const t = useT();
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
      <h1 className="text-2xl font-bold text-fg">{t("settings.title")}</h1>

      <div className="rounded-md border border-surface-border bg-surface-raised p-4 text-sm text-fg-subtle">
        {t("settings.apiKeyNotice")}
      </div>

      <div>
        <label className="block text-sm font-medium text-fg-muted">{t("settings.apiKeyLabel")}</label>
        <div className="mt-1 flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            value={youtubeApiKey}
            onChange={(e) => setYoutubeApiKey(e.target.value)}
            placeholder={t("settings.apiKeyPlaceholder")}
            className="flex-1 rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="rounded-md border border-surface-border px-3 text-sm text-fg-muted"
          >
            {showKey ? t("common.hide") : t("common.show")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-fg-muted">{t("settings.targetCountryLabel")}</label>
          <select
            value={targetCountry}
            onChange={(e) => setTargetCountry(e.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
          >
            <option value="US">{t("settings.countryUS")}</option>
            <option value="MA">{t("settings.countryMA")}</option>
            <option value="FR">{t("settings.countryFR")}</option>
            <option value="GB">{t("settings.countryGB")}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-muted">{t("settings.targetLanguageLabel")}</label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-fg"
          >
            <option value="en">{t("settings.languageEnglish")}</option>
            <option value="fr">{t("settings.languageFrench")}</option>
            <option value="ar">{t("settings.languageArabic")}</option>
          </select>
        </div>
      </div>

      <button
        onClick={save}
        disabled={!currentProject}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {saved ? t("settings.savedButton") : t("settings.saveButton")}
      </button>
    </div>
  );
}
