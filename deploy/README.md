# Deployment

## Hosted at a sub-path (epergaboni.com/jevseo)

The app is built with `NEXT_PUBLIC_BASE_PATH=/jevseo`, so Vercel serves it at
`https://jevseo-gold.vercel.app/jevseo` and the root deliberately 404s. The
paths line up one-to-one with the public URL, which keeps the proxy rules
trivial.

### Step 1 — check HostGator can proxy at all

This decides whether the approach works, so check before changing anything.

Upload `deploy/check-proxy.php` to `public_html`, open
`https://epergaboni.com/check-proxy.php`, and read the first line. It reports
whether `mod_proxy` and `mod_proxy_http` are present, and separately whether
the server can reach Vercel at all — a blocked outbound request stops a proxy
just as dead as a missing module.

Delete the file afterwards.

Known facts about this domain, checked on 21 September 2026:

| | |
| --- | --- |
| Host | HostGator, `192.185.5.208` |
| Nameservers | `ns8073.hostgator.com`, `ns8074.hostgator.com` |
| Server | Apache (not LiteSpeed, which would rule the proxy out) |
| `/jevseo` | currently 404, so the path is free |
| `jevseo.epergaboni.com` | unused, so the fallback is available |

### Step 2 — apply the rules

```bash
cp public_html/.htaccess public_html/.htaccess.backup
cat deploy/hostgator-jevseo.htaccess >> public_html/.htaccess
```

Then load `https://epergaboni.com/jevseo`. A 500 or a 404 almost always means
the proxy modules are unavailable — restore the backup and use the fallback.

### Fallback — a subdomain

If the proxy is not available, `jevseo.epergaboni.com` works with a single DNS
record and no proxying:

1. In Vercel: `vercel domains add jevseo.epergaboni.com`
2. In HostGator cPanel → **Zone Editor** → `epergaboni.com` → **Add CNAME**:
   name `jevseo`, value whatever Vercel prints (usually
   `cname.vercel-dns.com`). Leave every existing record alone — the apex `A`
   record keeps your main site on HostGator.
3. Remove `NEXT_PUBLIC_BASE_PATH` from the Vercel project and redeploy, so the
   app serves from the root again:
   ```bash
   vercel env rm NEXT_PUBLIC_BASE_PATH production --yes
   vercel deploy --prod
   ```
4. DNS usually propagates in minutes; Vercel issues the certificate
   automatically once it resolves.

### Fallback — Cloudflare

Point the domain's nameservers at Cloudflare, keep an origin rule sending
everything to HostGator, and add a rule routing `/jevseo/*` to
`jevseo-gold.vercel.app`. This is the most reliable path-based split, at the
cost of a third service in front of the domain.

## Environment variables

Set on the Vercel project, not in the repository:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres. Provisioned by the Marketplace integration. |
| `NEXT_PUBLIC_BASE_PATH` | `/jevseo` when serving at a sub-path; unset otherwise. Build-time only. |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL, used for metadata. |
| `NEXT_PUBLIC_GITHUB_URL` | The repository link in the header. |
| `CRAWL_BUDGET_SECONDS` | Optional. Overrides the crawl time budget. |

`TYPESAFE_API_KEY` and the DataForSEO pair are deliberately **not** set in
production. The hosted instance runs bring-your-own-key: visitors supply their
own credentials from their browser, so nobody spends the host's credits.
Setting them would make this instance pay for every visitor.
