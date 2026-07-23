"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function ProjectsPage() {
  const { projects, setProjects, switchProject } = useAppStore();
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
      <h1 className="text-2xl font-bold text-zinc-100">Projects</h1>
      <p className="mt-1 text-sm text-zinc-400">Manage the channels you generate content for.</p>

      <ul className="mt-6 space-y-2">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center justify-between rounded-md border border-surface-border bg-surface-raised px-4 py-3"
          >
            <span className="text-zinc-200">{project.name}</span>
            {project.isActive ? (
              <span className="text-xs font-medium text-accent">Active</span>
            ) : (
              <button
                onClick={() => switchProject(project.id)}
                className="text-xs text-zinc-400 hover:text-accent"
              >
                Switch
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New channel name"
          className="flex-1 rounded-md border border-surface-border bg-surface-raised px-3 py-2 text-sm text-zinc-100"
        />
        <button
          onClick={createProject}
          disabled={isCreating}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </div>
  );
}
