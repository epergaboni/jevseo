import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyse",
  description: "Score a live page or an unpublished draft for SEO, AEO and GEO.",
};

export default function AnalyseLayout({ children }: LayoutProps<"/analyse">) {
  return children;
}
