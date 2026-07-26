import { create } from "zustand";

export interface ProjectSummary {
  id: string;
  name: string;
  isActive: boolean;
}

export type Locale = "en" | "fr" | "ar";

interface AppState {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  locale: Locale;
  setProjects: (projects: ProjectSummary[]) => void;
  switchProject: (projectId: string) => void;
  setLocale: (locale: Locale) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  currentProject: null,
  locale: "en",

  setProjects: (projects) => {
    // Assumes at most one project has isActive: true (enforced server-side).
    // Falls back to the first project if none is flagged active, or null if the list is empty.
    set({
      projects,
      currentProject: projects.find((p) => p.isActive) ?? projects[0] ?? null,
    });
  },

  switchProject: (projectId) => {
    const projects = get().projects.map((p) => ({ ...p, isActive: p.id === projectId }));
    set({
      projects,
      currentProject: projects.find((p) => p.id === projectId) ?? null,
    });
  },

  setLocale: (locale) => set({ locale }),
}));
