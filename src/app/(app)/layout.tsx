import { SiteFooter, SiteNav } from "@/components/site-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
