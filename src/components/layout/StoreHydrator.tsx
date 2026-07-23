"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

export function StoreHydrator() {
  const setProjects = useAppStore((state) => state.setProjects);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data.projects))
      .catch((error) => console.error("Failed to load projects:", error));
  }, [setProjects]);

  return null;
}
