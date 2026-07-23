import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects } from "@/server/projects";
import { prisma } from "@/lib/prisma";
import { IdeasChart, type DailyPoint } from "@/components/dashboard/IdeasChart";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildLastSevenDays(createdAts: Date[]): DailyPoint[] {
  const days: DailyPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const count = createdAts.filter((date) => date >= day && date < nextDay).length;
    days.push({ label: DAY_LABELS[day.getDay()], count });
  }

  return days;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const projects = session?.user?.id ? await getUserProjects(session.user.id) : [];
  const activeProject = projects.find((p) => p.isActive);

  let ideasCount = 0;
  let thumbnailsCount = 0;
  let avgViralityScore: number | null = null;
  let avgCtrEstimate: number | null = null;
  let chartData: DailyPoint[] = buildLastSevenDays([]);

  if (activeProject) {
    const [ideas, thumbnails] = await Promise.all([
      prisma.idea.findMany({ where: { projectId: activeProject.id }, select: { viralityScore: true, createdAt: true } }),
      prisma.thumbnail.findMany({ where: { projectId: activeProject.id }, select: { ctrEstimate: true } }),
    ]);

    ideasCount = ideas.length;
    thumbnailsCount = thumbnails.length;
    avgViralityScore = ideas.length
      ? Math.round(ideas.reduce((sum, idea) => sum + idea.viralityScore, 0) / ideas.length)
      : null;
    avgCtrEstimate = thumbnails.length
      ? Math.round((thumbnails.reduce((sum, thumb) => sum + thumb.ctrEstimate, 0) / thumbnails.length) * 10) / 10
      : null;
    chartData = buildLastSevenDays(ideas.map((idea) => idea.createdAt));
  }

  const stats = [
    { label: "Ideas Generated", value: ideasCount, color: "#2a78d6", icon: "💡" },
    { label: "Thumbnails Generated", value: thumbnailsCount, color: "#eb6834", icon: "🖼️" },
    { label: "Avg Virality Score", value: avgViralityScore ?? "—", color: "#1baf7a", icon: "📈" },
    { label: "Avg Thumbnail CTR", value: avgCtrEstimate !== null ? `${avgCtrEstimate}%` : "—", color: "#eda100", icon: "🎯" },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Analytics Dashboard</p>
      <h1 className="mt-1 text-3xl font-bold text-zinc-100">{activeProject?.name ?? "My First Channel"}</h1>
      <p className="mt-2 max-w-xl text-zinc-400">
        A live snapshot of everything ArwaTube AI has generated for this project.
      </p>

      <div className="mt-6 rounded-xl bg-[#f9f9f7] p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col justify-between rounded-lg p-4 text-white shadow-sm"
              style={{ backgroundColor: stat.color }}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{stat.icon}</span>
                <span className="text-3xl font-bold">{stat.value}</span>
              </div>
              <p className="mt-3 text-sm font-medium opacity-95">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] p-4">
          <p className="text-sm font-semibold text-[#0b0b0b]">Ideas Generated — Last 7 Days</p>
          <div className="mt-3">
            <IdeasChart data={chartData} />
          </div>
        </div>
      </div>
    </div>
  );
}
