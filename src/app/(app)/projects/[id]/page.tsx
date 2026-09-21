import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/primitives";
import { ProjectWorkspace } from "@/components/project-workspace";
import {
  getProject,
  latestCrawl,
  listCannibalPairs,
  listPagesForCrawl,
  listPlan,
  projectSummary,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const crawl = await latestCrawl(id);
  const [summary, plan, cannibals, pages] = await Promise.all([
    projectSummary(id),
    listPlan(id),
    listCannibalPairs(id),
    crawl ? listPagesForCrawl(crawl.id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto w-full max-w-[90rem] px-6 py-10 sm:px-10">
      <nav className="mb-5 text-sm text-ink-3">
        <Link href="/projects" className="underline underline-offset-4 hover:text-ink">
          Projects
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-ink-2">{project.name}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{project.name}</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {project.domain}
            {project.audience && ` · written for ${project.audience}`}
          </p>
        </div>
      </header>

      {summary.analysed === 0 && !crawl && (
        <Card className="mb-6 border-dashed p-8 text-center">
          <p className="text-[15px] font-medium text-ink">Nothing crawled yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">
            Start a crawl and Jev will score every page it finds, then decide what to do with each
            one and order the work.
          </p>
        </Card>
      )}

      <ProjectWorkspace
        projectId={project.id}
        initialCrawl={crawl}
        initialPages={pages}
        summary={summary}
        plan={plan}
        cannibals={cannibals}
      />
    </main>
  );
}
