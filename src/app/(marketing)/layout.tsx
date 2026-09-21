import { SiteFooter, SiteNav } from "@/components/site-nav";

/**
 * A tool that scores structured data ought to carry its own, and the author
 * attribution is one of the things it judges pages on.
 */
const SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "JevSEO",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description:
    "Open-source SEO, AEO and GEO scoring where the judgments are made by Jev, a System One decision model.",
  license: "https://opensource.org/licenses/MIT",
  offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
  author: {
    "@type": "Person",
    name: "epergaboni",
    url: "https://epergaboni.com",
  },
};

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        // Static, author-controlled JSON with no user input in it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
      />
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
