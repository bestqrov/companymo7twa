"use client";

import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { useT } from "@/lib/i18n/useTranslation";

export default function OneClickPublishPage() {
  const t = useT();
  return <PlaceholderPage title={t("nav.oneClickPublish")} phase="Phase 5" />;
}
