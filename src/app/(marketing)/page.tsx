import Link from "next/link";
import { CopyBlock } from "@/components/copy-block";
import { Card, SectionHeading, buttonClass, sizeClass } from "@/components/primitives";

const INSTALL = `git clone https://github.com/epergaboni/jevseo.git
cd jevseo
pnpm install
pnpm dev          # then open /settings and paste your TypeSafe key`;

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <ProblemSolution />
      <ThreeReaders />
      <WhatYouGet />
      <WhyJev />
      <HowItWorks />
      <Limits />
      <GetStarted />
    </main>
  );
}

function Shell({
  children,
  className = "",
  bordered = true,
}: {
  children: React.ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <section className={bordered ? "border-t border-line" : ""}>
      <div className={`mx-auto w-full max-w-[90rem] px-6 sm:px-10 ${className}`}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------- hero */

function Hero() {
  return (
    <Shell bordered={false} className="py-16 sm:py-24">
      <div className="grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr] xl:gap-20">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-good" />
            Open source · Powered by Jev, a System One decision model
          </p>

          <h1 className="text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Jev reads your page, makes the call,{" "}
            <span className="text-accent">and tells you how sure it is.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
            JevSEO is an open-source SEO tool where the judgments are made by{" "}
            <a
              href="https://docs.typesafe.ai/concepts/system-one"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-ink underline decoration-accent-line underline-offset-4 hover:decoration-accent"
            >
              Jev
            </a>
            , a decision model that returns typed answers and calibrated probabilities instead of
            prose. It scores a page three times — for Google, for answer boxes, and for AI
            assistants — and ranks what to fix.
          </p>

          <div className="mt-6 max-w-xl rounded-xl border border-accent-line bg-accent-soft p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Why that matters
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              Ask a chatbot to score your page and it writes a number the way it writes a sentence.
              Ask twice, get two answers, with no way to tell a firm verdict from a guess. Jev
              commits to a position on a rubric you can read, and reports its own certainty
              separately — so you know which findings to act on and which to check yourself.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/analyse" className={`${buttonClass.primary} ${sizeClass.lg}`}>
              Analyse a page
            </Link>
            <Link href="/settings" className={`${buttonClass.secondary} ${sizeClass.lg}`}>
              Add your API key
            </Link>
          </div>

          <p className="mt-5 text-sm text-ink-3">
            Runs on your machine. Your keys never leave it. About two seconds and a hundredth of a
            penny per page.
          </p>
        </div>

        <div className="lg:pt-14">
          <CopyBlock code={INSTALL} label="Get started" />
          <p className="mt-3 text-sm text-ink-3">
            Node 22+ and a{" "}
            <a
              href="https://console.typesafe.ai"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline underline-offset-2"
            >
              TypeSafe key
            </a>
            . DataForSEO is optional and only powers the competitor comparison.
          </p>
        </div>
      </div>
    </Shell>
  );
}


/* ------------------------------------------------------- problem/solution */

const PROBLEM = [
  {
    title: "Search stopped being one thing",
    body: "Your page is now judged by three different systems that reward different things. Google ranks it, answer boxes extract from it, AI assistants decide whether to quote it. Almost every tool still scores the first one and calls it SEO.",
  },
  {
    title: "Checklist tools cannot read",
    body: "They count characters and check for missing tags. They will happily pass a page whose writing never answers the question in its own headline, because counting is all they can do.",
  },
  {
    title: "Chatbots can read, but they improvise",
    body: "Ask one to score your page and it writes a number the way it writes a sentence. Ask again tomorrow and the number moves. Worse, a firm verdict and a wild guess arrive in exactly the same confident tone.",
  },
  {
    title: "So you end up guessing",
    body: "You cannot tell which findings are solid, so you either act on all of them or trust none of them. Both waste the afternoon.",
  },
];

const SOLUTION = [
  {
    title: "Score all three, separately",
    body: "SEO, AEO and GEO each get their own judgments, their own score and their own fixes, because the work to improve them genuinely differs and sometimes conflicts.",
  },
  {
    title: "Count what is countable, in code",
    body: "Title length, missing descriptions, broken heading order, pages blocked from Google. Twenty checks, plain arithmetic, no model involved — because asking an AI to count characters invites a mistake it cannot catch.",
  },
  {
    title: "Send only the reading to Jev",
    body: "Twenty-five narrow questions, each with a written rubric whose levels describe concrete situations. Jev picks a level. It does not write an essay and it does not invent a number.",
  },
  {
    title: "Report certainty separately",
    body: "Every judgment carries its own confidence. Anything Jev was unsure about is flagged for a human to check rather than averaged into a tidy score you cannot interrogate.",
  },
];

function ProblemSolution() {
  return (
    <Shell className="py-16 sm:py-20">
      <SectionHeading
        overline="Problem and solution"
        title="Why another SEO tool"
        lead="The short version: the job changed, and the two kinds of tool available each get half of it right."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface-2 p-6 sm:p-7">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-full bg-bad-soft text-sm font-semibold text-bad-text"
            >
              ✕
            </span>
            <h3 className="text-lg font-semibold text-ink">The problem</h3>
          </div>
          <ol className="mt-5 flex flex-col gap-5">
            {PROBLEM.map((item, i) => (
              <li key={item.title} className="flex gap-4">
                <span className="tnum mt-0.5 text-sm font-medium text-ink-3">{i + 1}</span>
                <div>
                  <h4 className="font-medium text-ink">{item.title}</h4>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-accent-line bg-surface p-6 sm:p-7">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-full bg-good-soft text-sm font-semibold text-good-text"
            >
              ✓
            </span>
            <h3 className="text-lg font-semibold text-ink">What JevSEO does instead</h3>
          </div>
          <ol className="mt-5 flex flex-col gap-5">
            {SOLUTION.map((item, i) => (
              <li key={item.title} className="flex gap-4">
                <span className="tnum mt-0.5 text-sm font-medium text-accent">{i + 1}</span>
                <div>
                  <h4 className="font-medium text-ink">{item.title}</h4>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-ink-2">
        That split is the whole design, and it holds everywhere in the codebase:{" "}
        <strong className="font-semibold text-ink">
          code owns the rules, Jev owns the meaning, code owns the policy.
        </strong>
      </p>
    </Shell>
  );
}

/* ---------------------------------------------------------- three readers */

const READERS = [
  {
    code: "SEO",
    name: "Search engine optimisation",
    oneLine: "Getting found in Google's ranked list of links.",
    plain: "The ranked list of blue links. What everyone already means by SEO.",
    wants: "Does this page serve what the searcher actually wanted, cover what they expect to find, and say anything the other results do not?",
    checks: [
      "Search intent match",
      "Topic coverage",
      "Substance over padding",
      "First-hand experience",
      "Distinct angle",
    ],
  },
  {
    code: "AEO",
    name: "Answer engine optimisation",
    oneLine: "Getting your answer shown in the box above the results.",
    plain:
      "The box at the top of Google that answers the question so nobody clicks. Also voice assistants.",
    wants:
      "Can a machine lift a correct, complete answer out of this page and show it on its own, with no surrounding context?",
    checks: [
      "Answers up front",
      "Snippet-ready passage",
      "Sections stand alone",
      "Defines its subject",
      "Follow-up questions",
    ],
  },
  {
    code: "GEO",
    name: "Generative engine optimisation",
    oneLine: "Getting quoted and cited when an AI assistant answers.",
    plain: "ChatGPT, Perplexity, Google's AI summaries. The assistants that cite sources.",
    wants:
      "Is there a sentence here worth quoting, and enough provenance to justify naming this page as the source?",
    checks: [
      "Quotable claims",
      "Evidence density",
      "Original data",
      "Entity clarity",
      "Grounds for trust",
    ],
  },
];

function ThreeReaders() {
  return (
    <Shell className="py-16 sm:py-20">
      <SectionHeading
        overline="The problem"
        title="Your page has three readers now, not one"
        lead="They reward different things, and optimising for one does not get you the others. A page can rank tenth and still be the one ChatGPT quotes, because it happens to contain one clean, specific sentence. Another can own the answer box and never get cited, because it says nothing worth repeating."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {READERS.map((r) => (
          <Card key={r.code} className="flex flex-col p-6">
            <h3 className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-mono text-2xl font-semibold text-accent">{r.code}</span>
              <span className="text-sm font-normal text-ink-3">{r.name}</span>
            </h3>
            <p className="mt-4 text-base leading-relaxed text-ink">{r.plain}</p>
            <p className="mt-4 border-l-2 border-accent-line pl-4 text-[15px] leading-relaxed text-ink-2">
              {r.wants}
            </p>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-3">
              What gets scored
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {r.checks.map((c) => (
                <li
                  key={c}
                  className="rounded border border-line bg-surface-2 px-2 py-1 text-[13px] text-ink-2"
                >
                  {c}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mt-8 p-6">
        <h3 className="text-base font-semibold text-ink">The three terms, in one line each</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {READERS.map((r) => (
            <div key={r.code}>
              <dt className="font-mono text-sm font-semibold text-accent">{r.code}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">{r.name}.</span> {r.oneLine}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
          Most tools score the first one and call it done. That is the gap this fills.
        </p>
      </Card>
    </Shell>
  );
}

/* ---------------------------------------------------------- what you get */

function WhatYouGet() {
  return (
    <Shell className="py-16 sm:py-20">
      <SectionHeading
        overline="The output"
        title="A verdict you can act on, with its working shown"
        lead="Every number on the report traces back to either a measurement or a written rubric you can read and disagree with."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line bg-surface-2 px-5 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              Real output · gov.uk/vehicle-tax · “how much is car tax uk” · September 2026
            </span>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap items-end gap-8">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-3">Overall</p>
                <p className="figure mt-1 text-5xl font-semibold leading-none text-warn-text">50</p>
              </div>
              {[
                { code: "SEO", score: 49 },
                { code: "AEO", score: 41 },
                { code: "GEO", score: 59 },
              ].map((p) => (
                <div key={p.code}>
                  <p className="font-mono text-xs font-semibold text-ink-3">{p.code}</p>
                  <p className="figure mt-1 text-3xl font-semibold leading-none text-ink">
                    {p.score}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-bad-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-bad-text">
                  High
                </span>
                <p className="font-medium text-ink">Search intent match</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Reshape the page around what someone searching this query actually wants. Serving
                the wrong intent caps the ceiling no matter how good the writing is.
              </p>
              <p className="mt-2 text-xs text-ink-3">
                Jev&apos;s read: “It serves a different need entirely.” 95% sure.
              </p>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              That verdict is correct, and a checklist tool would have passed the page. It is a
              button that sends you off to pay. The pages actually ranking for that search are rate
              tables with the numbers on them. The page is good; it is answering a different
              question.
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-6">
            <h3 className="text-base font-semibold text-ink">Every claim carries its certainty</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              In that same report one judgment came back 95% sure and another 26%. The uncertain one
              is flagged as needing a human check rather than averaged into a tidy number. A chat
              model would have written both in the same confident tone.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-base font-semibold text-ink">Fixes are ranked, not listed</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              Ordered by how much score each one recovers. Blocking problems — a page Google cannot
              index — cap the score outright instead of being averaged away, because no amount of
              good writing fixes an invisible page.
            </p>
          </Card>
          <Card className="p-6">
            <h3 className="text-base font-semibold text-ink">Drafts work too</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              Paste an unpublished draft and get the same content judgments before it goes live,
              minus the checks that need a real URL.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

/* --------------------------------------------------------------- why jev */

function WhyJev() {
  return (
    <Shell className="py-16 sm:py-20">
      <SectionHeading
        overline="The engine"
        title="Why Jev, and not ChatGPT"
        lead="The obvious way to build this is to hand a page to an AI and ask for an SEO report. That gives you confident prose and a number nobody can defend. Ask twice, get two numbers."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <Card className="flex flex-col p-6">
          <h3 className="text-lg font-semibold text-ink">Asking a chat model</h3>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-surface-2 p-4 font-mono text-[13px] leading-relaxed text-ink-2">
{`"Rate this page's SEO out of 100
 and explain your reasoning."

→ "This page scores 72/100. The
   content is comprehensive and
   well-structured, though the
   meta description could be…"`}
          </pre>
          <ul className="mt-5 flex flex-col gap-2.5 text-[15px] leading-relaxed text-ink-2">
            <Point bad>The number is written, not measured. Ask again tomorrow and it moves.</Point>
            <Point bad>
              You cannot tell a confident answer from a guess. Both arrive in the same tone.
            </Point>
            <Point bad>Changing your mind about weighting means paying to run it all again.</Point>
            <Point bad>Twenty-five separate questions is minutes and real money, every time.</Point>
          </ul>
        </Card>

        <Card className="flex flex-col border-accent-line p-6">
          <h3 className="text-lg font-semibold text-ink">Asking Jev</h3>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-accent-soft p-4 font-mono text-[13px] leading-relaxed text-ink">
{`score("Does a 40–60 word passage
  answer the question if lifted out
  and shown on its own?", [
  "No passage survives being lifted…",
  "A candidate exists but leans on
   pronouns that break once separated…",
  "Workable, needs light trimming…",
  "Self-contained and correctly scoped…",
])

→ score 1.08 of 3 · 86% confident`}
          </pre>
          <ul className="mt-5 flex flex-col gap-2.5 text-[15px] leading-relaxed text-ink-2">
            <Point>A position on a rubric you wrote, in the repo, that you can argue with.</Point>
            <Point>Certainty is a separate number, so you know what to double-check.</Point>
            <Point>Judgments are stored, so re-weighting rescores instantly and free.</Point>
            <Point>All 25 questions answered in one pass, in about two seconds.</Point>
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <Figure
          value="2.3s"
          label="per full analysis"
          detail="Measured September 2026 on jev-1.13.0: 25 questions answered in one request."
        />
        <Figure
          value="£0.0001"
          label="per page"
          detail="3,969 input tokens at $0.042 per million, September 2026. Output tokens are free."
        />
        <Figure
          value="45"
          label="signals per page"
          detail="25 read by Jev, 20 measured in code. Every one shown in the report."
        />
      </div>

      <Card className="mt-6 p-6">
        <h3 className="text-base font-semibold text-ink">
          The rule that governs the whole codebase
        </h3>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink">
            Code owns the rules. The model owns the meaning. Code owns the policy.
          </strong>{" "}
          Title length is arithmetic, so a computer counts it and no AI is involved. Whether the
          writing shows real first-hand experience cannot be counted, so that goes to Jev as one
          narrow question. The weights that combine them are a file you can edit.
        </p>
      </Card>
    </Shell>
  );
}

function Point({ children, bad = false }: { children: React.ReactNode; bad?: boolean }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className={`mt-0.5 shrink-0 text-sm ${bad ? "text-bad-text" : "text-good-text"}`}
      >
        {bad ? "✕" : "✓"}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Figure({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <Card className="p-5">
      <p className="figure text-3xl font-semibold text-accent">{value}</p>
      <p className="mt-1 text-sm font-medium text-ink-2">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-3">{detail}</p>
    </Card>
  );
}

/* ---------------------------------------------------------- how it works */

const STEPS = [
  {
    n: "01",
    title: "Read the page",
    plain: "Fetches the URL and pulls out the real content, ignoring menus and footers.",
    tech: "Blocks private and loopback addresses. Link and image counts are scoped to the content region, so a mega-menu cannot satisfy the internal-linking check on boilerplate.",
  },
  {
    n: "02",
    title: "Measure what can be counted",
    plain: "Title length, missing descriptions, broken heading order, pages blocked from Google.",
    tech: "Twenty deterministic rules producing 0–1 signals. No model is involved, because asking one to count characters invites mistakes it has no way to catch.",
  },
  {
    n: "03",
    title: "Ask what needs reading",
    plain: "Whether it answers the question, whether anything is worth quoting, whether it sounds like experience.",
    tech: "Twenty-five narrow questions with written rubrics, sent in a single request. Jev reads the page once and answers all of them in parallel.",
  },
  {
    n: "04",
    title: "Compare against what ranks",
    plain: "Optionally pulls the current top ten and checks what they cover that you do not.",
    tech: "A second request, because it needs evidence that did not exist when the first ran. Results are cached for 24 hours so re-running costs nothing.",
  },
  {
    n: "05",
    title: "Score and rank the fixes",
    plain: "Three scores, then a list ordered by how much each fix is worth.",
    tech: "Judgments blend with checks per pillar at a weighting you own. Blocking violations cap the pillar outright rather than being averaged away.",
  },
];

function HowItWorks() {
  return (
    <Shell className="py-16 sm:py-20">
      <SectionHeading overline="The mechanism" title="What happens when you press Analyse" />
      <ol className="mt-10 flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-line">
        {STEPS.map((s) => (
          <li key={s.n} className="grid gap-4 bg-surface p-6 sm:grid-cols-[3rem_1fr_1fr] sm:gap-8">
            <span className="font-mono text-sm text-accent">{s.n}</span>
            <div>
              <h3 className="text-lg font-medium text-ink">{s.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{s.plain}</p>
            </div>
            <p className="border-l-2 border-line pl-5 text-sm leading-relaxed text-ink-3">
              {s.tech}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-ink-3">
        Left column is what it does. Right column is how, if you care.
      </p>
    </Shell>
  );
}

/* ----------------------------------------------------------------- limits */

const LIMITS = [
  {
    title: "It will not rewrite your page",
    body: "Jev reads and judges. It does not draft. You get what is wrong and how badly, with evidence, and the writing stays with you.",
  },
  {
    title: "It does not run JavaScript",
    body: "Pages that build themselves in the browser come back nearly empty. It says so plainly instead of scoring the shell, and suggests pasting the content instead.",
  },
  {
    title: "It does not predict rankings",
    body: "Nothing here is trained on ranking outcomes. It judges the qualities that make a page rankable, quotable and extractable. That is a narrower claim, and an honest one.",
  },
  {
    title: "The weights are not science",
    body: "They are defaults in a file you can edit. Validate them against your own pages before treating any score as a target.",
  },
];

function Limits() {
  return (
    <Shell className="py-16 sm:py-20">
      <SectionHeading
        overline="Honestly"
        title="What it will not do"
        lead="Worth reading before you trust a number from any tool, this one included."
      />
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {LIMITS.map((l) => (
          <Card key={l.title} className="p-6">
            <h3 className="text-base font-semibold text-ink">{l.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{l.body}</p>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------ get started */

function GetStarted() {
  return (
    <Shell className="py-16 sm:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Run it yourself in about a minute
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">
            Clone it, paste one key on the settings page, analyse something. Everything runs
            locally and nothing is sent anywhere except the page you asked about.
          </p>

          <dl className="mt-7 flex max-w-xl flex-col gap-4">
            <div className="flex gap-4">
              <dt className="w-24 shrink-0">
                <span className="rounded bg-good-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-good-text">
                  Required
                </span>
              </dt>
              <dd className="text-[15px] leading-relaxed text-ink-2">
                <a
                  href="https://console.typesafe.ai"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-ink underline decoration-accent-line underline-offset-4 hover:decoration-accent"
                >
                  A TypeSafe key
                </a>{" "}
                — every judgment on every page. Without it nothing runs.
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 shrink-0">
                <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Optional
                </span>
              </dt>
              <dd className="text-[15px] leading-relaxed text-ink-2">
                <a
                  href="https://app.dataforseo.com/api-access"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                >
                  DataForSEO
                </a>{" "}
                — only for comparing against what currently ranks. Everything else works
                without it; the comparison is skipped and the report says so.
              </dd>
            </div>
          </dl>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/analyse" className={`${buttonClass.primary} ${sizeClass.lg}`}>
              Analyse a page
            </Link>
            <a
              href="https://console.typesafe.ai"
              target="_blank"
              rel="noreferrer noopener"
              className={`${buttonClass.secondary} ${sizeClass.lg}`}
            >
              Get a TypeSafe key
            </a>
          </div>
          <p className="mt-6 text-[15px] text-ink-2">
            Built and maintained by{" "}
            <a
              href="https://epergaboni.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-ink underline decoration-accent-line underline-offset-4 hover:decoration-accent"
            >
              epergaboni
            </a>
            . Open source under the MIT licence — fork it, change the weights, make it yours.
          </p>
        </div>
        <CopyBlock code={INSTALL} label="Get started" />
      </div>
    </Shell>
  );
}
