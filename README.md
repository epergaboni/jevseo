<h1>JevSEO</h1>

**Score a page for search, answer engines and generative engines — with judgments you can audit.**

Paste a URL or a draft. JevSEO measures everything with a fixed threshold in code, asks
[Jev](https://docs.typesafe.ai) the questions that actually need judgment, and returns three
scores plus a ranked list of fixes with the evidence behind each one.

Roughly two seconds and £0.0001 per page. Runs locally; your keys stay on your machine.

MIT licensed. Built by [epergaboni](https://epergaboni.com).

---

## Why this exists

A page used to have one job: rank. Now it has three, and they reward different things.

A page can rank tenth and still be the one ChatGPT quotes. A page can own the featured snippet
and never be cited by an assistant. Optimising for one and assuming the others follow is how
traffic quietly disappears — and most tools still score the first job and call it SEO.

| | Optimising for | The question it answers |
| --- | --- | --- |
| **SEO** | Google's ranking systems | Does this serve the intent behind the query, cover what a reader expects, and say something the other results do not? |
| **AEO** | Featured snippets, People Also Ask, voice | Can a machine lift a correct, complete answer out of this page and show it on its own? |
| **GEO** | ChatGPT, AI Overviews, Perplexity, Claude | Is there anything here worth quoting, and enough provenance to justify citing it? |

Scored separately, because the fixes genuinely differ and sometimes conflict.

## Why Jev, and not a chat model

The obvious way to build this is to hand a page to an LLM and ask for an SEO report. That
produces confident prose and a number nobody can defend. Ask twice, get two numbers.

[Jev](https://docs.typesafe.ai/concepts/system-one) is a **System One** model. It does not
generate text. It answers a typed question with a probability distribution and nothing else:

```ts
score("Does a passage of 40 to 60 words answer the reader's question correctly if it were " +
      "lifted out and shown entirely on its own?", [
  "No passage survives being lifted out — every candidate depends on surrounding text.",
  "A candidate exists but it is far too long, or leans on pronouns that break once separated.",
  "A workable passage exists, though it needs light trimming to stand alone.",
  "At least one passage is self-contained, correctly scoped, and the right length.",
])

// → { score: 1.08, probabilities: { 0: .02, 1: .88, 2: .10, 3: .00 }, confidence: 0.86 }
```

What that buys, concretely:

- **A position on a rubric you wrote.** The levels are in the repo. You can disagree with one and
  change it.
- **Calibrated probabilities, and confidence as a separate axis.** The answer tells you what;
  confidence tells you whether to act on it. Anything under 0.55 is flagged in the report as
  needing a human check instead of being averaged into a tidy number.
- **Reusable data.** Judgments are stored, then composed. Changing a weight re-scores instantly
  without spending another token.
- **One request for everything.** Jev reads the state once and answers all 25 questions in
  parallel. The TypeSafe docs measure batching as roughly 12× cheaper and 10× faster than asking
  one at a time. A typical page is about 4,000 input tokens at $0.042 per million; output tokens
  are free.

### The rule that governs the whole codebase

> **Code owns the rules. The model owns the meaning. Code owns the policy.**

| It is a… | If… | It lives in… |
| --- | --- | --- |
| Rule | it has a fixed threshold, a count, or a computable yes/no | `src/lib/extract/rules.ts` |
| Judgment | it needs reading comprehension | `src/lib/judge/dimensions.ts` |
| Policy | it is a weight, a blend, or a cut-off | `src/lib/score/compose.ts` |

Title length is not a question for a model. Whether the writing shows first-hand experience is
not something you can regex. Keeping those apart is why the scores are explainable.

## Two ways to use it

**One page at a time** (`/analyse`) — paste a URL or a draft, get three scores and a ranked
list of fixes.

**A whole site** (`/projects`) — this is where Jev works as a decision maker rather than a
scorer. Point it at a domain and it will:

1. **Crawl** it, reading robots.txt, preferring your sitemap, staying on one origin, and
   preferring pages under the seed's own path — seeding at `gov.uk/vehicle-tax` should not
   wander into alcohol duty bulletins.
2. **Score** every page it finds, the same 45 signals the single-page tool uses.
3. **Decide** what to do with each one. Not a score — a typed Choice between *leave*,
   *improve*, *rewrite*, *merge*, *split* and *prune*, with the full probability distribution
   kept so you can see how close the runner-up was, plus an opportunity and effort reading.
4. **Detect overlaps** — pairs of your own pages competing for the same intent, which split
   authority that should belong to one page.
5. **Build a plan** — one ordered list across the whole site, opportunity first, effort as a
   tie-break, blocking problems at the top. Tick items off as you go.

A ten-page crawl costs roughly 55,000 input tokens, about £0.002 for the whole site.

### Where the data lives

A single SQLite file at `.jevseo/jevseo.db`, through `node:sqlite` — built into Node 22+, so
there is no native build, no postinstall and no signup. Back it up by copying one file; delete
it by deleting one file. It is gitignored.

Setting `DATABASE_URL` switches the app to Postgres, which is what a deployed instance needs:
a serverless filesystem is ephemeral, so a local file would silently lose writes. That case is
checked at startup rather than discovered when data goes missing.

Every table carries an `ownerId`, and every query filters on it. It is `"local"` today and
becomes a real account id when authentication lands, so adding accounts is additive rather
than a rewrite.

## Quick start

```bash
git clone https://github.com/epergaboni/jevseo.git
cd jevseo
pnpm install
pnpm dev
```

Open <http://localhost:3000/settings>, paste a TypeSafe API key from
[console.typesafe.ai](https://console.typesafe.ai), press **Test connection**, then go to
**Analyse**.

That is the only required credential.

### Credentials

Read from the environment first, then from `.jevseo.local.json` in the project root — the file the
settings page writes. The environment always wins, so a deployment can never be reconfigured by a
stray file.

| Variable | Required | What it does |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | **yes** | Every semantic judgment. |
| `TYPESAFE_MODEL` | no | Pin a version such as `jev-1.13.0` instead of tracking `jev-latest`. |
| `DATAFORSEO_LOGIN` | no | Live SERP comparison. |
| `DATAFORSEO_PASSWORD` | no | The API password from your DataForSEO dashboard, not your account password. |
| `SERP_CACHE_TTL_HOURS` | no | How long a cached SERP stays valid. Default 24; `0` disables caching. |

Without DataForSEO everything still works; the competitor step is skipped and says so in the
report's warnings.

`.jevseo.local.json` is gitignored and written mode `0600`. The settings page returns masked
previews (`api••••3416`) and never the values. Writing is **disabled when
`NODE_ENV=production`**, so a deployed instance cannot be reconfigured by whoever loads it — set
environment variables on the host instead.

### Not wasting DataForSEO credit

A live SERP lookup costs about **$0.002**. Three things keep that in check:

- **Every lookup is cached to disk for 24 hours**, keyed on query, location and
  language. Re-running the same analysis — after an edit, on a second click, in a
  demo — reads the cache and spends nothing. Verified against the account balance:
  identical before and after a cached run.
- **Nothing is fetched unless you ask.** The checkbox is off by default, and a
  request without a target query skips the lookup entirely.
- **The spend is on the report.** Each run shows either `SERP $0.0020` or
  `SERP from cache, $0.00 spent`.

```bash
pnpm serp:cache          # what is cached, how old, what it cost
pnpm serp:cache clear    # force fresh lookups (and fresh charges)
```

Set `SERP_CACHE_TTL_HOURS` to change the window, or `0` to disable caching.
Connection tests are always free — they call `appendix/user_data`, which reads
your balance and costs nothing.

### Troubleshooting DataForSEO

If the settings page reports `40100`, check the pair against the live API before
changing anything in the app:

```bash
pnpm check:dataforseo            # prompt and test; nothing is stored
pnpm check:dataforseo --save     # prompt, test, and store the pair if it works
pnpm check:dataforseo --saved    # re-test the pair already in .jevseo.local.json
```

The password is never echoed, so it stays out of shell history, and `--save`
writes only after DataForSEO has accepted the pair.

It calls `appendix/user_data`, which costs nothing, and reports DataForSEO's own
`status_code` and message plus a character count for each value — enough to spot
stray whitespace or a smart quote picked up while copying.

`40100` covers four different problems and the message does not say which:

1. **The API password is not your dashboard password.** It is a separate value at
   [app.dataforseo.com/api-access](https://app.dataforseo.com/api-access).
2. **The API login may not be your account email.** That page shows the exact string.
3. **A new account must confirm its email** before the API answers at all.
4. **IP access restriction** may be on with your address missing from the allow list.

## How a run works

1. **Fetch and parse** — `src/lib/extract/fetch-page.ts`. Blocks loopback, private and link-local
   addresses. Strips nav, header, footer and scripts before counting anything, so a mega-menu
   cannot satisfy the internal-linking rule on boilerplate.
2. **Measure** — `src/lib/extract/rules.ts`. Twenty deterministic 0–1 signals.
3. **Judge** — `src/lib/judge/dimensions.ts` builds the applicable questions; `run.ts` sends them
   in one request.
4. **Compare** *(optional)* — with a target query and DataForSEO credentials, a second request
   judges format, coverage and differentiation against the live top ten. Second request because it
   needs evidence that did not exist when the first ran.
5. **Compose** — `src/lib/score/compose.ts`. Judgments blend with rules at 70/30 per pillar, fixes
   rank by recoverable score.

### Two details worth knowing

**Blocking violations are conditions, not weights.** A `noindex` page cannot rank, so no amount of
good writing should average it back up. `BLOCKING_RULES` caps the pillar outright. This is the
"any serious violation" case, as distinct from compensating preferences.

**Gated judgments.** `procedural_clarity` only counts when `describes_process` clears its
threshold. Both go out in the same batch and code decides afterwards which answer is relevant —
the speculative fan-out pattern. A page that describes no process is not marked down for unclear
steps.

## Design

The interface is deliberately plain and the colour is not a matter of taste.

**The status trio is computed, not chosen.** Green, amber and red were run through
a six-check validator against this exact paper surface: lightness band, chroma
floor, colour-blind separation, a normal-vision floor, and contrast. The first
attempt failed badly — amber and red sat ΔE 4.0 apart under deuteranopia and 12.3
apart under normal vision, meaning "needs work" and "failing" were hard to tell
apart for everyone. The shipped values (`#00875a`, `#b8860b`, `#96201a`) clear every
check with no warnings, worst pair ΔE 8.5 under protanopia and 19.2 normal.

**Colour is never the only channel.** Every band ships a word next to it, so a
verdict survives colour blindness, greyscale printing and a screenshot.

**The interactive colour is cool on purpose.** An earlier warm terracotta accent sat
close enough to the failing red that a button could be mistaken for a verdict.

**Bars are one ink, not a traffic light.** In a list of twenty judgments the bar
length already carries the value; colouring each one by its value spends a channel
re-encoding what length shows, and turns the panel into noise. Status colour is
reserved for the three pillar tiles, where the state itself is the message.

**Text variants are darker than mark variants.** A colour that clears 3:1 as a shape
does not necessarily clear 4.5:1 as prose, so status words use darker steps.

If you change a colour, re-run the validator rather than eyeballing it.

### Dogfooding

The landing page is scored by the tool it describes. The first run returned 76 and
flagged three things: it never defined its own subject in one liftable sentence, its
performance figures carried no date, and it had no lists. All three were fixed, and
it now scores 84. That loop is the intended way to use this.

## Layout

```
src/
├── app/
│   ├── page.tsx                  landing page
│   ├── analyse/                  the tool
│   ├── settings/                 credentials (server component + client form)
│   └── api/
│       ├── analyse/              the full pipeline
│       └── settings/             read, write, test connections
├── components/           primitives, report, nav, copy block
└── lib/
    ├── config/                   credential resolution, env then local file
    ├── extract/                  fetch, parse, deterministic rules
    ├── judge/                    the question catalogue and the runner
    ├── score/                    weights, blending, fix ranking
    ├── serp/                     DataForSEO
    └── typesafe/                 the Jev client (server-only)
```

## Tests

```bash
pnpm test              # 152 tests
pnpm test:coverage     # thresholds: 80% lines/statements/functions, 75% branches
pnpm typecheck
pnpm lint
```

Covers extraction, the SSRF guard, every rule, credential resolution and masking, the production
write refusal, SERP cache expiry and spend control, score composition, blocking caps, fix ranking,
robots.txt parsing, URL canonicalisation and path affinity, link extraction, schema migration and
owner scoping, and the integrity of both the judgment catalogue and the page-action vocabulary —
which is declared in three places and would otherwise drift silently.

The database tests run against a real temporary SQLite file rather than a mock, because the
properties worth proving — that cascades cascade and that one owner cannot read another's
projects — are exactly the ones a mock would fake.

Network wrappers are excluded from coverage rather than mocked into a false green.

## Adding a dimension

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version — one entry in `DIMENSIONS`:

```ts
{
  id: "my_dimension",
  pillars: ["geo"],
  label: "Short UI label",
  weight: 2,
  remedy: "What to do when this scores low. It becomes the fix text the user reads.",
  build: () => score("One narrow question referring to `page.content`.", [
    "A concrete description of the worst case.",
    "A concrete description of the middle.",
    "A concrete description of the best case.",
  ]),
}
```

Levels describe **situations**, not grades. If it has a fixed number in it, it is a rule.

## Deploying

```bash
vercel
vercel env add TYPESAFE_API_KEY
vercel --prod
```

The analyse route runs on the Node.js runtime with `maxDuration = 120`.

**Read [SECURITY.md](SECURITY.md) first if the deployment will be public.** This tool fetches
arbitrary URLs on the server's behalf and spends your API credits on every request, and it ships
with no authentication or rate limiting, because the intended use is a local tool.

## What it will not do

- **It does not run JavaScript.** Client-rendered pages come back nearly empty; the analyser says
  so rather than scoring the shell, and suggests pasting the content instead. Sites that block bots
  return 403, which it reports as bot protection rather than a broken page.
- **It does not predict rankings.** Nothing here is trained against ranking outcomes. It judges the
  qualities that make a page rankable, quotable and extractable — a different claim, and an honest
  one.
- **It truncates long content** at 28,000 characters to stay inside Jev's 32k state budget, and
  reports the truncation as a warning.
- **The weights are not science.** They are defaults in a file you can edit. Validate them against
  your own pages and outcomes before treating a score as a target.

## Credits

Built by **[epergaboni](https://epergaboni.com)**.

Judgments are made by [TypeSafe Jev](https://docs.typesafe.ai). SERP data comes from
[DataForSEO](https://dataforseo.com). Built with Next.js, Tailwind CSS, Drizzle and Vitest.

MIT licensed — see [LICENSE](LICENSE). Contributions welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md).
