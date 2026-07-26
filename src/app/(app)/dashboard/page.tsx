import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects } from "@/server/projects";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/dashboard/DashboardView";
import type { DailyPoint } from "@/components/dashboard/IdeasChart";

const DAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

  return (
    <DashboardView
      projectName={activeProject?.name ?? null}
      ideasCount={ideasCount}
      thumbnailsCount={thumbnailsCount}
      avgViralityScore={avgViralityScore}
      avgCtrEstimate={avgCtrEstimate}
      chartData={chartData}
    />
  );
}
