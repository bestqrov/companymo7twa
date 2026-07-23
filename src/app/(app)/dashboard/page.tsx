import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserProjects } from "@/server/projects";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const projects = session?.user?.id ? await getUserProjects(session.user.id) : [];
  const activeProject = projects.find((p) => p.isActive);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Analytics Dashboard</p>
      <h1 className="mt-1 text-3xl font-bold text-zinc-100">{activeProject?.name ?? "My First Channel"}</h1>
      <p className="mt-2 max-w-xl text-zinc-400">
        A live snapshot of everything VifaTube AI has generated for this project will appear here
        once Idea Finder and the Long-Form Suite ship.
      </p>
    </div>
  );
}
