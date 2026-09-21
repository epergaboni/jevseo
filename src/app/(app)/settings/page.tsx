import { Card } from "@/components/primitives";
import { SettingsForm } from "@/components/settings-form";
import {
  CREDENTIAL_META,
  CREDENTIAL_STORE_FILE,
  canWriteCredentials,
  credentialStatuses,
} from "@/lib/config/credentials";

// Credential state is read per request; a cached page would show a stale one.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const initial = {
    statuses: credentialStatuses(),
    meta: CREDENTIAL_META,
    canWrite: canWriteCredentials(),
    storeFile: CREDENTIAL_STORE_FILE,
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Credentials are read from the environment first, then from{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">
            {CREDENTIAL_STORE_FILE}
          </code>{" "}
          in the project root. That file is gitignored, written with owner-only permissions, and
          never leaves your machine.
        </p>
      </header>

      <SettingsForm initial={initial} />

      <Card className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Configuring a deployment
        </h2>
        <p className="mt-2 text-sm text-muted">
          The settings page writes to a local file and is disabled in production on purpose — an
          instance anyone can reach must not let a visitor rewrite its credentials. Set them as
          environment variables on the host instead:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-muted p-3 font-mono text-xs leading-relaxed">
{`vercel env add TYPESAFE_API_KEY
vercel env add DATAFORSEO_LOGIN
vercel env add DATAFORSEO_PASSWORD`}
        </pre>
      </Card>
    </main>
  );
}
