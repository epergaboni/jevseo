import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://jevseo.epergaboni.com"),
  title: {
    default: "JevSEO — typed judgments for SEO, AEO and GEO",
    template: "%s · JevSEO",
  },
  description:
    "Open-source scoring for search, answer engines and generative engines. Rules measured in code, meaning judged by Jev, every score auditable.",
  applicationName: "JevSEO",
  authors: [{ name: "epergaboni", url: "https://epergaboni.com" }],
  creator: "epergaboni",
  publisher: "epergaboni",
  openGraph: {
    title: "JevSEO — typed judgments for SEO, AEO and GEO",
    description:
      "Score a page for search, answer engines and generative engines with calibrated judgments you can audit.",
    type: "website",
    locale: "en_GB",
    siteName: "JevSEO",
  },
  twitter: { card: "summary_large_image", creator: "@epergaboni" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
