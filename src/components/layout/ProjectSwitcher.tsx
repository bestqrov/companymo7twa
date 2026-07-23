"use client";

import { useAppStore } from "@/store/useAppStore";

async function persistActiveProject(projectId: string) {
  await fetch("/api/projects/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
}

export function ProjectSwitcher() {
  const { projects, currentProject, switchProject } = useAppStore();

  if (projects.length === 0) {
    return null;
  }

  return (
    <select
      value={currentProject?.id ?? ""}
      onChange={(e) => {
        switchProject(e.target.value);
        void persistActiveProject(e.target.value);
      }}
      className="w-full rounded-md border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-zinc-100"
    >
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
