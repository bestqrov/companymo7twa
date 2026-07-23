import { create } from "zustand";

/**
 * Scaffolded for Phase 2+: carries a selected idea/script across modules,
 * e.g. Idea Finder's "Adapt for Shorts" populating the Repurposing Engine.
 * Unused until a later phase defines its first payload shape.
 */
interface WorkflowState {
  selectedIdeaId: string | null;
  setSelectedIdeaId: (id: string | null) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  selectedIdeaId: null,
  setSelectedIdeaId: (id) => set({ selectedIdeaId: id }),
}));
