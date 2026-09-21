# Contributing

This project is maintained by [epergaboni](https://epergaboni.com).

Issues and pull requests are welcome. The most useful contributions are new
judgment dimensions and evidence that an existing one is miscalibrated.

## Getting set up

```bash
pnpm install
pnpm dev            # open /settings and paste a TypeSafe key
```

Everything must pass before a pull request is reviewed:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## The design rule that governs everything

**Code owns the rules, the model owns the meaning, code owns the policy.**

| It is a… | If… | It belongs in… |
| --- | --- | --- |
| Rule | it has a fixed threshold, a count, or a yes/no you can compute | `src/lib/extract/rules.ts` |
| Judgment | it needs reading comprehension | `src/lib/judge/dimensions.ts` |
| Policy | it is a weight, a blend, or a cut-off | `src/lib/score/compose.ts` |

A pull request that asks the model to count characters, or hard-codes a weight
inside a question, will be asked to move it.

## Adding a judgment

One entry in `DIMENSIONS`:

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

What reviewers look for:

- **One judgment per question.** If the rubric needs the word "and", it is
  probably two dimensions.
- **Levels describe situations, not grades.** "Mostly fine" tells the model
  nothing. "Steps are identifiable but run together, with prerequisites left
  implicit" tells it a great deal.
- **State is referenced by backticked path** — `` `page.content` ``,
  `` `target_query` ``, `` `audience` `` — so the model knows what to read.
- **No fixed numbers in the question.** "At least 300 words" is a rule.
- **`invert: true`** when a high raw value is bad — stuffing, hedging,
  promotional tone.
- **`applies`** to skip a question whose evidence is absent, and **`gate`** when
  relevance depends on another judgment. A page that describes no process must
  not be marked down for unclear steps.
- **A remedy someone can act on.** "Improve your content" is not a remedy.

Then add it to `tests/dimensions.test.ts` expectations if it changes counts, and
run a few real pages through it before opening the PR. Say in the PR what you
tried it on and what it said — a dimension that fires on everything or nothing
is worse than no dimension.

## Reporting a miscalibrated judgment

The most valuable issue you can open. Include:

1. The URL or the draft text.
2. The dimension and the value it returned.
3. What you believe the right answer is, and why.

Open it with the **Miscalibrated judgment** template.

## Commit messages

Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.

## Licence

By contributing you agree that your work is licensed under the
[MIT licence](LICENSE) that covers this project.
