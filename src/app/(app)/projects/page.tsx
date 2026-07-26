"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useT } from "@/lib/i18n/useTranslation";

export default function ProjectsPage() {
  const { projects, setProjects, switchProject } = useAppStore();
  const t = useT();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function createProject() {
    if (!newName.trim()) return;
    setIsCreating(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    setProjects([...projects, { ...data.project, isActive: false }]);
    setNewName("");
    setIsCreating(false);
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-fg">{t("projects.title")}</h1>
      <p className="mt-1 text-sm text-fg-subtle">{t("projects.subtitle")}</p>

      <ul className="mt-6 space-y-2">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center justify-between rounded-md border border-surface-border bg-surface-raised px-4 py-3"
          >
            <span className="text-fg">{project.name}</span>
            {project.isActive ? (
              <span className="text-xs font-medium text-accent">{t("common.active")}</span>
            ) : (
              <button
                onClick={() => switchProject(project.id)}
                className="text-xs text-fg-subtle hover:text-accent"
              >
                {t("common.switchLabel")}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("projects.placeholderNewChannelName")}
          className="flex-1 rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-fg"
        />
        <button
          onClick={createProject}
          disabled={isCreating}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {t("projects.createButton")}
        </button>
      </div>
    </div>
  );
}
