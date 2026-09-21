import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
  description: "Crawl a whole site and let Jev decide what to do with every page.",
};

export default function ProjectsLayout({ children }: LayoutProps<"/projects">) {
  return children;
}
