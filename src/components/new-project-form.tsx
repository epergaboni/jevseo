"use client";

import { apiFetch } from "@/lib/client/credential-store";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, buttonClass, sizeClass } from "@/components/primitives";

const FIELD =
  "w-full rounded-lg border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3/70 focus:border-accent";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [audience, setAudience] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startUrl: startUrl.trim(),
          audience: audience.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as
        | { ok: true; project: { id: string } }
        | { ok: false; error: string };
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      router.push(`/projects/${payload.project.id}`);
    } catch {
      setError("The request never reached the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card as="div" className="h-fit p-5">
      <h2 className="text-base font-semibold text-ink">Add a site</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
        The crawler reads robots.txt, prefers your sitemap, and stays on one domain.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="p-name" className="text-sm font-medium text-ink">
            Name
          </label>
          <input
            id="p-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme marketing site"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="p-url" className="text-sm font-medium text-ink">
            Start URL
          </label>
          <input
            id="p-url"
            type="url"
            required
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            placeholder="https://example.co.uk"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="p-aud" className="flex items-baseline gap-2 text-sm font-medium text-ink">
            Audience <span className="text-xs font-normal text-ink-3">optional</span>
          </label>
          <input
            id="p-aud"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="operations managers at UK charities"
            className={FIELD}
          />
          <p className="text-xs leading-relaxed text-ink-3">
            Used to judge whether each page is pitched correctly.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending || !name.trim() || !startUrl.trim()}
          className={`${buttonClass.primary} ${sizeClass.md}`}
        >
          {pending ? "Creating…" : "Create project"}
        </button>

        {error && (
          <p className="rounded-lg border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-sm text-bad-text">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
