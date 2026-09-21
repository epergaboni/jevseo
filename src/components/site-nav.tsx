import Link from "next/link";

const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/epergaboni/jevseo";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-[90rem] items-center gap-8 px-6 py-3.5 sm:px-10">
        <Link href="/" className="text-[17px] font-semibold tracking-tight text-ink">
          Jev<span className="text-accent">SEO</span>
        </Link>
        <div className="flex items-center gap-6 text-[15px]">
          <Link href="/projects" className="text-ink-2 transition-colors hover:text-ink">
            Projects
          </Link>
          <Link href="/analyse" className="text-ink-2 transition-colors hover:text-ink">
            Single page
          </Link>
          <Link href="/settings" className="text-ink-2 transition-colors hover:text-ink">
            Settings
          </Link>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          GitHub
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 px-6 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <p>
          Built by{" "}
          <a
            href="https://epergaboni.com"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-accent"
          >
            epergaboni
          </a>
          . MIT licensed. Powered by{" "}
          <a
            href="https://docs.typesafe.ai"
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline underline-offset-2"
          >
            TypeSafe Jev
          </a>
          .
        </p>
        <p>Scores are calibrated judgments, not guarantees.</p>
      </div>
    </footer>
  );
}
