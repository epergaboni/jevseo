import "server-only";
import { choice, noul, score } from "@typesafe-ai/sdk";
import type { ChoiceResponse, NoulResponse, ScoreResponse } from "@typesafe-ai/sdk";
import { getTypeSafeClient } from "@/lib/typesafe/client";
import { ACTION_BLURB, type PageAction } from "@/lib/judge/actions";
import type { Judgment, PageFacts, PillarScore } from "@/lib/types";

/**
 * Jev as the decision maker.
 *
 * The per-page report says what is wrong. This says what to *do*, which is a
 * different question and the one a person actually has to answer. It is a
 * Choice rather than a score, because "improve" and "prune" are not points on
 * a scale, and the full distribution is kept so the UI can show how close the
 * runner-up was.
 */

const ACTION_CRITERIA = {
  leave:
    "The page already does its job. Any remaining issues are cosmetic and the effort is better spent on another page.",
  improve:
    "The page is fundamentally sound and on the right topic. Specific, addressable gaps stand between it and working well.",
  rewrite:
    "The topic is right but the execution is not. Fixing it piecemeal would take longer than starting the copy again.",
  merge:
    "The page substantially overlaps another on the same site and would be stronger as one combined page.",
  prune:
    "The page attracts nothing, serves no intent, and its continued existence dilutes the rest of the site.",
  split:
    "The page tries to serve several distinct search intents at once and would serve each better as its own page.",
} as const;

export interface PageDecisionResult {
  action: PageAction;
  confidence: number;
  probabilities: Record<string, number>;
  opportunity: number;
  effort: number;
  reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/** The page, boiled down to what a decision actually needs. */
function decisionState(
  facts: PageFacts,
  pillars: PillarScore[],
  siteAudience: string | null,
  otherTitles: string[],
) {
  const weakest = pillars
    .flatMap((p) => p.judgments)
    .filter((j, i, all) => all.findIndex((x) => x.id === j.id) === i)
    .sort((a, b) => a.value - b.value)
    .slice(0, 8)
    .map((j: Judgment) => `${j.label}: ${Math.round(j.value * 100)}/100${j.verdict ? ` — ${j.verdict}` : ""}`);

  return {
    site: {
      audience: siteAudience ?? "a general reader",
      other_page_titles: otherTitles.slice(0, 40),
    },
    page: {
      url: facts.url ?? "unpublished draft",
      title: facts.title ?? "none",
      headings: facts.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).slice(0, 40),
      word_count: facts.wordCount,
      excerpt: facts.text.slice(0, 6_000),
    },
    scores: Object.fromEntries(pillars.map((p) => [p.pillar, p.score])),
    weakest_judgments: weakest,
  };
}

export async function decidePageAction(
  facts: PageFacts,
  pillars: PillarScore[],
  siteAudience: string | null,
  otherTitles: string[],
): Promise<PageDecisionResult> {
  const result = await getTypeSafeClient().systemOne({
    state: decisionState(facts, pillars, siteAudience, otherTitles),
    questions: {
      action: choice(
        "Given `scores`, `weakest_judgments` and `page`, what single action should the site owner take on this page next? Consider `site.other_page_titles` when judging whether it duplicates something that already exists.",
        ACTION_CRITERIA,
      ),
      opportunity: score(
        "If the recommended work on `page` were done well, how much would this site gain?",
        [
          "Almost nothing. The page serves a need nobody has, or one already met better elsewhere on the site.",
          "A little. It would tidy up a minor corner of the site with no real traffic or credibility attached.",
          "A worthwhile amount. The page covers a subject people genuinely look for and currently serves them poorly.",
          "A great deal. This is a subject central to what the site is for, and the page is the main thing standing between it and that audience.",
        ],
      ),
      effort: score("How much work does the recommended action on `page` involve?", [
        "Minutes. A handful of edits to headings, a title, or a few sentences.",
        "An hour or two. Meaningful rewriting of sections, but the research already exists.",
        "Half a day or more. Substantial new writing, or research that has not been done yet.",
        "Days. New original work — testing, interviews, data gathering — before anything can be written.",
      ]),
      thin: noul(
        "Is `page` thin content: a page that exists mainly to occupy a URL rather than to serve a reader?",
        {
          true: "It has little substance of its own — a stub, a near-duplicate, or a page of links with no argument.",
          false: "It makes a genuine attempt to serve a reader, whatever its execution.",
        },
      ),
    },
  });

  const answers = result.answers as {
    action: ChoiceResponse<typeof ACTION_CRITERIA>;
    opportunity: ScoreResponse;
    effort: ScoreResponse;
    thin: NoulResponse;
  };

  const action = answers.action.choice as PageAction;
  const opportunity = normaliseScore(answers.opportunity);
  const effort = normaliseScore(answers.effort);

  return {
    action,
    confidence: Math.round(answers.action.confidence * 100),
    probabilities: answers.action.probabilities as Record<string, number>,
    opportunity: Math.round(opportunity * 100),
    effort: Math.round(effort * 100),
    reason: buildReason(action, answers.thin.noul, opportunity, effort),
    usage: result.usage,
  };
}

function normaliseScore(answer: ScoreResponse): number {
  const levels = Object.keys(answer.legend).length;
  return levels > 1 ? Math.min(1, Math.max(0, answer.score / (levels - 1))) : 0;
}

function buildReason(action: PageAction, thin: number, opportunity: number, effort: number): string {
  const parts = [ACTION_BLURB[action]];
  if (thin > 0.6) parts.push("Reads as thin content.");
  if (opportunity >= 0.66 && effort <= 0.4) parts.push("High return for little work — do this first.");
  else if (opportunity <= 0.33 && effort >= 0.66) parts.push("Expensive for what it would return.");
  return parts.join(" ");
}

/**
 * Cannibalisation. Asked pairwise, but only for pairs whose titles already
 * look related — a full N² sweep would spend tokens proving that unrelated
 * pages are unrelated.
 */
export async function detectCannibalisation(
  candidates: { aId: string; aTitle: string; bId: string; bTitle: string }[],
): Promise<{ aId: string; bId: string; overlap: number; recommendation: string }[]> {
  if (candidates.length === 0) return [];

  const capped = candidates.slice(0, 40);
  const questions = Object.fromEntries(
    capped.map((pair, i) => [
      `pair_${i}`,
      noul(
        {
          question:
            "Would a search engine struggle to choose between these two pages, because they target the same search intent rather than covering different ground?",
          page_a: pair.aTitle,
          page_b: pair.bTitle,
        },
        {
          true: "They compete. A searcher wanting one would be equally served by the other, so the site is splitting its own authority.",
          false: "They cover different ground, even if the subject area is shared.",
        },
      ),
    ]),
  );

  const result = await getTypeSafeClient().systemOne({
    state: { note: "Each question names its own two pages." },
    questions,
  });

  const answers = result.answers as Record<string, NoulResponse>;
  const out: { aId: string; bId: string; overlap: number; recommendation: string }[] = [];

  capped.forEach((pair, i) => {
    const answer = answers[`pair_${i}`];
    if (!answer || answer.type !== "noul" || answer.noul < 0.6) return;
    out.push({
      aId: pair.aId,
      bId: pair.bId,
      overlap: Math.round(answer.noul * 100),
      recommendation:
        answer.noul > 0.85
          ? "Strong overlap. Merge into one page and redirect the weaker URL."
          : "Likely overlap. Differentiate the angles, or merge if they cannot be separated.",
    });
  });

  return out;
}
