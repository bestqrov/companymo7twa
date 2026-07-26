"use client";

import { IdeasChart, type DailyPoint } from "./IdeasChart";
import { useT } from "@/lib/i18n/useTranslation";

interface Stat {
  labelKey: string;
  value: number | string;
  color: string;
  icon: string;
}

export function DashboardView({
  projectName,
  ideasCount,
  thumbnailsCount,
  avgViralityScore,
  avgCtrEstimate,
  chartData,
}: {
  projectName: string | null;
  ideasCount: number;
  thumbnailsCount: number;
  avgViralityScore: number | null;
  avgCtrEstimate: number | null;
  chartData: DailyPoint[];
}) {
  const t = useT();

  const stats: Stat[] = [
    { labelKey: "dashboard.statIdeasGenerated", value: ideasCount, color: "#2a78d6", icon: "💡" },
    { labelKey: "dashboard.statThumbnailsGenerated", value: thumbnailsCount, color: "#eb6834", icon: "🖼️" },
    { labelKey: "dashboard.statAvgVirality", value: avgViralityScore ?? "—", color: "#1baf7a", icon: "📈" },
    {
      labelKey: "dashboard.statAvgCtr",
      value: avgCtrEstimate !== null ? `${avgCtrEstimate}%` : "—",
      color: "#eda100",
      icon: "🎯",
    },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t("dashboard.eyebrow")}</p>
      <h1 className="mt-1 text-3xl font-bold text-fg">{projectName ?? t("dashboard.defaultProjectName")}</h1>
      <p className="mt-2 max-w-xl text-fg-subtle">{t("dashboard.subtitle")}</p>

      <div className="mt-6 rounded-xl bg-[#f9f9f7] p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.labelKey}
              className="flex flex-col justify-between rounded-lg p-4 text-white shadow-sm"
              style={{ backgroundColor: stat.color }}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{stat.icon}</span>
                <span className="text-3xl font-bold">{stat.value}</span>
              </div>
              <p className="mt-3 text-sm font-medium opacity-95">{t(stat.labelKey)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] p-4">
          <p className="text-sm font-semibold text-[#0b0b0b]">{t("dashboard.chartTitle")}</p>
          <div className="mt-3">
            <IdeasChart data={chartData} />
          </div>
        </div>
      </div>
    </div>
  );
}
