import "server-only";
import { score } from "@typesafe-ai/sdk";
import type { ScoreResponse } from "@typesafe-ai/sdk";
import { getTypeSafeClient } from "@/lib/typesafe/client";
import type { AnalysisInput, Competitor, Judgment, PageFacts, Pillar } from "@/lib/types";

/**
 * A second call, warranted because it needs evidence that did not exist when
 * the first one ran: the live results the page is actually competing against.
 */

interface CompetitiveDimension {
  id: string;
  pillars: Pillar[];
  label: string;
  weight: number;
  remedy: string;
  build: () => ReturnType<typeof score>;
}

const COMPETITIVE_DIMENSIONS: CompetitiveDimension[] = [
  {
    id: "serp_format_match",
    pillars: ["seo"],
    label: "Format matches the results",
    weight: 2.5,
    remedy:
      "Match the format the results page already rewards. When every ranking result is a comparison table and yours is an essay, the format is the gap, not the writing.",
    build: () =>
      score(
        "How closely does the format of `page` match the format shared by the results in `ranking_results`?",
        [
          "A different kind of page entirely from everything currently ranking.",
          "Broadly the same subject but a noticeably different format from most results.",
          "The same format as several results, with some structural differences.",
          "The same format as the results that dominate this query.",
        ],
      ),
  },
  {
    id: "serp_coverage_gap",
    pillars: ["seo", "aeo"],
    label: "Coverage against the results",
    weight: 2.5,
    remedy:
      "Add the subjects the ranking results cover and this page does not. Those gaps are the most direct route up the page.",
    build: () =>
      score(
        "Judging by their titles and snippets, how much of what `ranking_results` cover is also covered in `page.content`?",
        [
          "Most of what the ranking results promise is absent from the page.",
          "Some overlap, but several themes common across the results are missing.",
          "Most themes are covered, with one or two gaps.",
          "Everything the ranking results cover is present, and then some.",
        ],
      ),
  },
  {
    id: "serp_differentiation",
    pillars: ["seo", "geo"],
    label: "Reason to outrank",
    weight: 2,
    remedy:
      "Give a reason to displace an incumbent. Matching the ranking results earns a tie, and ties go to the page that already has the history.",
    build: () =>
      score(
        "What does `page` offer that none of `ranking_results` appear to, judging by their titles and snippets?",
        [
          "Nothing — it reads as another instance of what already ranks.",
          "Minor differences of wording or emphasis only.",
          "One clear advantage: fresher data, a broader scope, or an angle none of the results take.",
          "Several clear advantages that a reader would notice immediately.",
        ],
      ),
  },
];

export async function judgeAgainstSerp(
  facts: PageFacts,
  input: AnalysisInput,
  competitors: Competitor[],
): Promise<{ judgments: Judgment[]; usage: { input_tokens: number; output_tokens: number } }> {
  if (competitors.length === 0) {
    return { judgments: [], usage: { input_tokens: 0, output_tokens: 0 } };
  }

  const questions = Object.fromEntries(COMPETITIVE_DIMENSIONS.map((d) => [d.id, d.build()]));

  const result = await getTypeSafeClient().systemOne({
    state: {
      target_query: input.targetQuery?.trim() || "not specified",
      page: {
        url: facts.url ?? "an unpublished draft",
        title: facts.title ?? "none",
        headings: facts.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`),
        content: facts.text.slice(0, 16_000),
      },
      ranking_results: competitors.map((c) => ({
        position: c.rank,
        url: c.url,
        title: c.title,
        snippet: c.snippet,
      })),
    },
    questions,
  });

  const answers = result.answers as Record<string, ScoreResponse>;
  const judgments: Judgment[] = [];

  for (const dimension of COMPETITIVE_DIMENSIONS) {
    const answer = answers[dimension.id];
    if (!answer || answer.type !== "score") continue;
    const levels = Object.keys(answer.legend).length;
    const value = levels > 1 ? Math.min(1, Math.max(0, answer.score / (levels - 1))) : 0;
    const legend = answer.legend as Record<string, string>;

    judgments.push({
      id: dimension.id,
      pillars: dimension.pillars,
      label: dimension.label,
      question: typeof dimension.build().instructions === "string"
        ? (dimension.build().instructions as string)
        : "",
      kind: "score",
      value,
      confidence: answer.confidence,
      verdict: legend[String(Math.round(answer.score))] ?? null,
      weight: dimension.weight,
      remedy: dimension.remedy,
    });
  }

  return { judgments, usage: result.usage };
}
