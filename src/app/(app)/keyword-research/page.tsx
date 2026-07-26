"use client";

import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { useT } from "@/lib/i18n/useTranslation";

export default function KeywordResearchPage() {
  const t = useT();
  return <PlaceholderPage title={t("nav.keywordResearch")} phase="Phase 3" />;
}
