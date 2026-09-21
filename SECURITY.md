# Security

Maintained by [epergaboni](https://epergaboni.com).

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability**
button on the Security tab, rather than opening a public issue.

## What this project does with your credentials

- **Keys are read server-side only.** `src/lib/typesafe/client.ts` and
  `src/lib/serp/dataforseo.ts` both carry the `server-only` guard, so importing
  either from a client component fails the build.
- **Keys are never sent to the browser.** The settings API returns a masked
  preview (`api••••3416`) and the credential's source, never its value.
- **The local store is gitignored and mode 0600.** `.jevseo.local.json` is
  written owner-read-only and is listed in `.gitignore`.
- **The workspace database is gitignored.** `.jevseo/jevseo.db` holds the pages
  you have crawled, their content and their scores. For a private or staging
  site that is data you probably do not want published. So is
  `.jevseo-cache/`, which holds cached search results.
- **CI enforces all of this.** The `secrets` job fails the build if any of
  those paths appear anywhere in the git history, if a credential-shaped
  string is committed to a tracked file, or if `.env.example` ever ships with
  a value in it. Run the same checks locally before going public:

  ```bash
  git log --all --full-history --name-only --pretty=format: \
    | grep -E '^(\.jevseo|\.env)' || echo "clean"
  ```
- **The settings write path is disabled in production.** `canWriteCredentials()`
  returns false whenever `NODE_ENV === "production"`, so a deployed instance
  cannot be reconfigured by a visitor. Deployments are configured through
  environment variables, which always take precedence over the local file.

## Deploying this publicly

This tool fetches arbitrary URLs on the server's behalf and spends your API
credits on every analysis. If you deploy it somewhere reachable, you are
responsible for putting authentication and rate limiting in front of it. There
is none built in, because the intended use is a local tool.

The URL fetcher blocks loopback, private, and link-local addresses
(`src/lib/extract/fetch-page.ts`), which covers the obvious SSRF cases. It does
not defend against DNS rebinding — if that matters for your deployment, put an
egress proxy in front of it.
