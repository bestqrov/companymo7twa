import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store/useAppStore";

const sampleProjects = [
  { id: "p1", name: "My First Channel", isActive: true },
  { id: "p2", name: "Side Channel", isActive: false },
];

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({ projects: [], currentProject: null });
  });

  it("sets projects and derives currentProject from the active one", () => {
    useAppStore.getState().setProjects(sampleProjects);

    expect(useAppStore.getState().projects).toHaveLength(2);
    expect(useAppStore.getState().currentProject?.id).toBe("p1");
  });

  it("switches the current project", () => {
    useAppStore.getState().setProjects(sampleProjects);
    useAppStore.getState().switchProject("p2");

    expect(useAppStore.getState().currentProject?.id).toBe("p2");
    expect(useAppStore.getState().projects.find((p) => p.id === "p2")?.isActive).toBe(true);
    expect(useAppStore.getState().projects.find((p) => p.id === "p1")?.isActive).toBe(false);
  });
});
