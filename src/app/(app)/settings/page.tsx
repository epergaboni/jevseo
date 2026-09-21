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
          Add your own TypeSafe key here to run anything. It is saved in this browser only, so a
          key added on one machine or one domain does not follow you to another.
        </p>
      </header>

      <SettingsForm initial={initial} />

      <Card className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Running your own instance
        </h2>
        <p className="mt-2 text-sm text-muted">
          Keys entered above always win. On an instance you host yourself you can also supply a
          fallback for everyone, as environment variables or, when running locally, in{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs">
            {CREDENTIAL_STORE_FILE}
          </code>{" "}
          in the project root. That file is gitignored, owner-only, and never leaves the machine.
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
