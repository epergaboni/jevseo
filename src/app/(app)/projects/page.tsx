import Link from "next/link";
import { Card } from "@/components/primitives";
import { NewProjectForm } from "@/components/new-project-form";
import { listProjects } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <main className="mx-auto w-full max-w-[90rem] px-6 py-10 sm:px-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Projects</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            A project is one site. Crawl it, and Jev decides what to do with every page it finds —
            leave it, improve it, rewrite it, merge it, or remove it — then turns those decisions
            into an ordered plan.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          {projects.length === 0 ? (
            <Card className="border-dashed p-10 text-center">
              <p className="text-[15px] font-medium text-ink">No projects yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
                Add a site to crawl. Everything is stored in a single SQLite file inside this
                project folder, so nothing leaves your machine.
              </p>
            </Card>
          ) : (
            projects.map((project) => (
              <Card key={project.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-lg font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                    >
                      {project.name}
                    </Link>
                    <p className="mt-1 text-sm text-ink-3">{project.domain}</p>
                    {project.audience && (
                      <p className="mt-2 text-sm text-ink-2">Written for {project.audience}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-ink-3">
                    <p className="tnum">{project.pageCount} pages</p>
                    <p className="mt-1">
                      {project.lastCrawlAt
                        ? `Last crawl ${project.lastCrawlAt.toLocaleDateString("en-GB")}`
                        : "Never crawled"}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <NewProjectForm />
      </div>
    </main>
  );
}
