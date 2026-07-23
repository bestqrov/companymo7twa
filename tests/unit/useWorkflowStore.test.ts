import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "@/store/useWorkflowStore";

describe("useWorkflowStore", () => {
  beforeEach(() => {
    useWorkflowStore.setState({ selectedIdeaId: null });
  });

  it("sets the selected idea id", () => {
    useWorkflowStore.getState().setSelectedIdeaId("idea-1");
    expect(useWorkflowStore.getState().selectedIdeaId).toBe("idea-1");
  });

  it("clears the selected idea id", () => {
    useWorkflowStore.getState().setSelectedIdeaId("idea-1");
    useWorkflowStore.getState().setSelectedIdeaId(null);
    expect(useWorkflowStore.getState().selectedIdeaId).toBeNull();
  });
});
