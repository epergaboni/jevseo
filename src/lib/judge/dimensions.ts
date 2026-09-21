import { choice, noul, score } from "@typesafe-ai/sdk";
import type { Question } from "@typesafe-ai/sdk";
import type { AnalysisInput, PageFacts, Pillar } from "@/lib/types";

/**
 * The judgment catalogue.
 *
 * Every entry is one narrow semantic question for Jev. Anything with a fixed
 * threshold (character counts, link counts, schema presence) belongs in
 * `lib/extract/rules.ts` instead — code owns rules, the model owns meaning.
 *
 * Score levels describe concrete situations and stand on their own, so the
 * model never has to infer what a level means from its neighbours.
 */
export interface Dimension {
  id: string;
  pillars: Pillar[];
  label: string;
  /** Relative weight inside each of its pillars. */
  weight: number;
  /** What to do when this scores low. Becomes the fix text. */
  remedy: string;
  /** True when a high raw value is bad, so the composed value is flipped. */
  invert?: boolean;
  /** Skip the question when the evidence to answer it is not present. */
  applies?: (facts: PageFacts, input: AnalysisInput) => boolean;
  /**
   * Another dimension's id that must clear its threshold before this one counts.
   * Both are asked in the same batch; code decides afterwards whether the
   * gated answer is relevant. This is the speculative fan-out pattern.
   */
  gate?: { id: string; threshold: number };
  /** Asked to gate another dimension, never scored in its own right. */
  gateOnly?: boolean;
  build: () => Question;
}

const hasQuery = (_f: PageFacts, input: AnalysisInput) => Boolean(input.targetQuery?.trim());

export const INTENT_QUESTION = choice(
  "What kind of result is a searcher most likely to want for `target_query`? Judge the query itself, not what `page` happens to contain.",
  {
    informational: "They want to understand or learn something. A guide, explainer or definition wins.",
    commercial: "They are comparing options before buying. Reviews, comparisons and best-of lists win.",
    transactional: "They are ready to act — buy, sign up, download or book.",
    navigational: "They want a specific brand, product or page they already have in mind.",
    local: "They want something near them — a place, a service area or opening hours.",
  },
);

export const DIMENSIONS: Dimension[] = [
  // ------------------------------------------------------------------ SEO
  {
    id: "intent_match",
    pillars: ["seo"],
    label: "Search intent match",
    weight: 3,
    applies: hasQuery,
    remedy:
      "Reshape the page around what someone searching this query actually wants. Serving the wrong intent caps the ceiling no matter how good the writing is.",
    build: () =>
      score(
        "How well does `page.content` serve what someone searching `target_query` is actually trying to do?",
        [
          "It serves a different need entirely — a buyer's query met with company history, or a how-to query met with a sales page.",
          "It touches the right subject but the format is wrong for the need, so the searcher has to work to extract what they came for.",
          "It serves the need, but buries it beneath preamble or mixes it with material aimed at a different reader.",
          "It serves the need directly and in the format the query implies, with nothing substantial in the way.",
        ],
      ),
  },
  {
    id: "query_coverage",
    pillars: ["seo"],
    label: "Topic coverage",
    weight: 2.5,
    applies: hasQuery,
    remedy:
      "Add the subtopics a reader expects to find alongside this one. Gaps here are what send people back to the results page.",
    build: () =>
      score(
        "Judged against what a well-informed reader would expect on this subject, how completely does `page.content` cover `target_query`?",
        [
          "Only the headline topic is mentioned; every obvious follow-on question is absent.",
          "The main topic is covered but several subtopics a reader would expect are missing.",
          "Most expected subtopics appear, with one or two notable gaps.",
          "The expected subtopics are covered, including the follow-on questions a reader would raise next.",
        ],
      ),
  },
  {
    id: "title_quality",
    pillars: ["seo"],
    label: "Title relevance and pull",
    weight: 2,
    applies: (facts) => Boolean(facts.title),
    remedy:
      "Rewrite the title so it names the subject in the searcher's own words and gives a concrete reason to click over the result above it.",
    build: () =>
      score(
        "How well does `page.title` both match `target_query` and give a searcher a reason to choose it over the neighbouring results?",
        [
          "It neither names the subject clearly nor offers any reason to click.",
          "It names the subject but reads as generic boilerplate that any competitor could have written.",
          "It names the subject clearly and hints at something specific inside.",
          "It names the subject in the searcher's own words and promises something concrete — a number, an outcome, a distinct angle.",
        ],
      ),
  },
  {
    id: "meta_quality",
    pillars: ["seo"],
    label: "Meta description",
    weight: 1,
    applies: (facts) => Boolean(facts.metaDescription),
    remedy:
      "Rewrite the meta description as a promise about what the page delivers, not a summary of what it contains.",
    build: () =>
      score(
        "How well does `page.meta_description` earn a click from someone scanning a results page for `target_query`?",
        [
          "It is duplicated boilerplate, truncated mid-sentence, or describes the site rather than the page.",
          "It describes the page accurately but flatly, with no reason to choose it.",
          "It is accurate and relevant, with a mild hook.",
          "It states plainly what the reader gets and why it beats the alternatives.",
        ],
      ),
  },
  {
    id: "substance",
    pillars: ["seo", "geo"],
    label: "Substance over padding",
    weight: 2.5,
    remedy:
      "Cut the restated introductions and generic context. Length only helps when every paragraph adds something the previous one did not.",
    build: () =>
      score(
        "What proportion of `page.content` carries information a reader could not have guessed before arriving?",
        [
          "Almost all of it is padding — restated headings, generic context, and sentences that say nothing.",
          "Roughly half is padding; the useful material is real but thinly spread.",
          "Mostly substantive, with some recognisable filler around the edges.",
          "Nearly every paragraph adds something specific that the previous one did not.",
        ],
      ),
  },
  {
    id: "experience_signals",
    pillars: ["seo", "geo"],
    label: "First-hand experience",
    weight: 2,
    remedy:
      "Add evidence that someone actually did this: what was tested, what it cost, what went wrong, what you would do differently.",
    build: () =>
      score(
        "How strongly does `page.content` show that its author has direct, first-hand experience of the subject rather than having assembled it from other sources?",
        [
          "Nothing distinguishes it from a summary of other pages on the same subject.",
          "General familiarity is evident but no specific first-hand encounter is described.",
          "Some concrete first-hand detail appears — a test run, a client case, a specific incident.",
          "Sustained first-hand detail throughout: specific conditions, measurements, costs, failures, or decisions the author personally made.",
        ],
      ),
  },
  {
    id: "audience_fit",
    pillars: ["seo"],
    label: "Audience fit",
    weight: 1.5,
    remedy:
      "Adjust the register. Explaining what the reader already knows wastes their time; assuming what they do not know loses them.",
    build: () =>
      score(
        "How well does the reading level and assumed prior knowledge of `page.content` fit `audience`?",
        [
          "Badly mismatched — either explains basics the reader has long since mastered, or assumes expertise they do not have.",
          "Noticeably off in places, with unexplained jargon or over-explained fundamentals.",
          "Broadly right, with occasional lapses.",
          "Pitched precisely: terms are introduced when the reader would need them and not before.",
        ],
      ),
  },
  {
    id: "keyword_stuffing",
    pillars: ["seo"],
    label: "Written for machines",
    weight: 1.5,
    invert: true,
    remedy:
      "Remove the repeated exact-match phrasing. Unnatural repetition reads as manipulation to both readers and ranking systems.",
    build: () =>
      noul(
        "Does `page.content` repeat key phrases in a way that reads as written for a search engine rather than a person?",
        {
          true: "Phrases recur in contorted, unnatural constructions, or appear far more often than normal writing would place them.",
          false: "Terminology recurs only as naturally as the subject requires.",
        },
      ),
  },
  {
    id: "differentiation",
    pillars: ["seo", "geo"],
    label: "Distinct angle",
    weight: 2,
    remedy:
      "Find the claim only you can make. Pages that say what every other page says give no system a reason to prefer them.",
    build: () =>
      score(
        "How much does `page.content` offer that a reader would not find on any other page covering this subject?",
        [
          "Entirely interchangeable with the standard treatment of this topic.",
          "The same ground as everyone else, differently worded.",
          "Mostly familiar, but with at least one genuinely distinct argument, dataset or perspective.",
          "Built around a position, dataset or experience that is specific to this author and not available elsewhere.",
        ],
      ),
  },

  // ------------------------------------------------------------------ AEO
  {
    id: "direct_answer",
    pillars: ["aeo"],
    label: "Answers up front",
    weight: 3,
    applies: hasQuery,
    remedy:
      "Put the answer in the first two sentences under the heading, then explain. Answer engines extract the opening, not the conclusion.",
    build: () =>
      score(
        "How quickly does `page.content` give a direct answer to `target_query`?",
        [
          "No direct answer appears anywhere; the reader has to infer it.",
          "The answer is present but buried deep, after substantial preamble.",
          "The answer arrives reasonably early but is wrapped in qualification before it is stated.",
          "The answer is stated plainly in the opening lines, before any elaboration.",
        ],
      ),
  },
  {
    id: "extractable_answer",
    pillars: ["aeo"],
    label: "Snippet-ready passage",
    weight: 2.5,
    remedy:
      "Write one 40–60 word passage that answers the question completely on its own, with no pronouns pointing at earlier text.",
    build: () =>
      score(
        "Does `page.content` contain a passage of roughly 40 to 60 words that would answer the reader's question correctly if it were lifted out and shown entirely on its own?",
        [
          "No passage survives being lifted out — every candidate depends on surrounding text to make sense.",
          "A candidate exists but it is either far too long or leans on pronouns and references that break once separated.",
          "A workable passage exists, though it needs light trimming to stand alone.",
          "At least one passage is self-contained, correctly scoped, and the right length to be displayed verbatim.",
        ],
      ),
  },
  {
    id: "question_coverage",
    pillars: ["aeo"],
    label: "Follow-up questions",
    weight: 2,
    remedy:
      "Add the questions people ask next, each as its own heading with its own self-contained answer beneath it.",
    build: () =>
      score(
        "How well does `page.content` address the related questions a reader would naturally ask next about this subject?",
        [
          "It answers one question and stops.",
          "A couple of related questions are touched on, but only in passing.",
          "Several related questions are addressed, though not clearly signposted.",
          "The obvious follow-up questions each get their own clearly signposted, self-contained answer.",
        ],
      ),
  },
  {
    id: "section_independence",
    pillars: ["aeo", "geo"],
    label: "Sections stand alone",
    weight: 2.5,
    remedy:
      "Make each section readable in isolation. Retrieval systems rarely pass along the paragraph that came before.",
    build: () =>
      score(
        "If each section of `page.content` were shown on its own with no other section visible, how many would still make complete sense?",
        [
          "Almost none — sections constantly refer back to earlier material with 'as mentioned above' or unexplained pronouns.",
          "Some sections stand alone; most need their predecessors to be understood.",
          "Most sections stand alone, with a few dependent on earlier context.",
          "Every section introduces its own subject and resolves it without relying on anything outside itself.",
        ],
      ),
  },
  {
    id: "definition_present",
    pillars: ["aeo"],
    label: "Defines its subject",
    weight: 1.5,
    remedy:
      "Add one plain sentence defining the core subject. Answer engines reach for definitions constantly, and cannot invent one.",
    build: () =>
      noul(
        "Does `page.content` contain a clear, single-sentence definition of the main subject that would make sense to someone encountering the term for the first time?",
        {
          true: "A plain definitional sentence appears, of the form 'X is …', understandable without the rest of the page.",
          false: "The subject is discussed throughout but never actually defined in one place.",
        },
      ),
  },
  {
    id: "describes_process",
    pillars: ["aeo"],
    label: "Describes a process",
    weight: 0,
    gateOnly: true,
    remedy: "",
    build: () =>
      noul("Does `page.content` describe how to carry out a task, in steps a reader could follow?", {
        true: "It sets out a procedure the reader is meant to perform.",
        false: "It explains, compares or describes, but asks the reader to do nothing in sequence.",
      }),
  },
  {
    id: "procedural_clarity",
    pillars: ["aeo"],
    label: "Steps and sequence",
    weight: 1.5,
    gate: { id: "describes_process", threshold: 0.5 },
    remedy:
      "Number the steps and state what each one needs and produces. Answer engines reproduce procedures as ordered lists or not at all.",
    build: () =>
      score("How clearly does `page.content` set out the sequence of steps a reader must follow?", [
        "The steps and their order have to be reconstructed by the reader from continuous prose.",
        "Steps are identifiable but run together, with prerequisites and outcomes left implicit.",
        "Steps are clearly separated and ordered, though some outcomes are unstated.",
        "Each step is discrete, ordered, and states what it needs and what it produces.",
      ]),
  },
  {
    id: "hedging",
    pillars: ["aeo"],
    label: "Hedged into uselessness",
    weight: 1.5,
    invert: true,
    remedy:
      "Commit to an answer. 'It depends' is not extractable — give the answer for the common case, then name the exceptions.",
    build: () =>
      noul(
        "Does `page.content` hedge so heavily that a reader could not come away with a usable answer?",
        {
          true: "Claims are qualified into vagueness — 'it varies', 'it depends', 'results may differ' — with no position taken.",
          false: "Positions are stated plainly, with exceptions named as exceptions rather than used to avoid answering.",
        },
      ),
  },

  // ------------------------------------------------------------------ GEO
  {
    id: "quotability",
    pillars: ["geo"],
    label: "Quotable claims",
    weight: 3,
    remedy:
      "Write claims that survive being quoted: one sentence, one fact, named subject, concrete figure. Vague sentences never get cited.",
    build: () =>
      score(
        "How readily could a generative assistant lift a sentence from `page.content`, show it to a user as a standalone fact, and attribute it to this page?",
        [
          "Nothing is quotable — the writing is general enough that quoting it would add nothing.",
          "A few claims exist but need surrounding context to be meaningful once quoted.",
          "Several sentences carry a specific, self-contained claim.",
          "The page is dense with self-contained claims naming concrete figures, dates, entities or outcomes.",
        ],
      ),
  },
  {
    id: "evidence_density",
    pillars: ["geo"],
    label: "Evidence and specifics",
    weight: 2.5,
    remedy:
      "Replace adjectives with numbers. 'Significantly faster' is unciteable; '2.4× faster on a 500-row import' is.",
    build: () =>
      score(
        "How much of `page.content` is supported by specifics — figures, dates, named sources, measurements — rather than assertion?",
        [
          "Claims are asserted with no supporting specifics at all.",
          "Occasional specifics, with most claims left unsupported.",
          "Specifics appear regularly and support the main claims.",
          "Nearly every substantive claim carries a figure, date, measurement or named source next to it.",
        ],
      ),
  },
  {
    id: "original_data",
    pillars: ["geo"],
    label: "Original data",
    weight: 2,
    remedy:
      "Publish something only you have: a survey, a benchmark, an internal dataset. Original figures are the most-cited thing on the web.",
    build: () =>
      noul(
        "Does `page.content` present original data, research or testing carried out by its author rather than figures gathered from elsewhere?",
        {
          true: "It reports results the author produced — a survey they ran, benchmarks they measured, a dataset they compiled.",
          false: "Any figures present are drawn from other sources, or there are none.",
        },
      ),
  },
  {
    id: "entity_clarity",
    pillars: ["geo"],
    label: "Entity clarity",
    weight: 2,
    remedy:
      "Name things fully at least once — the organisation, product, version and place. Ambiguous entities get dropped from knowledge graphs.",
    build: () =>
      score(
        "How unambiguously does `page.content` name the people, organisations, products and places it discusses?",
        [
          "Key entities are referred to only as 'we', 'the product' or 'the platform', and are never actually named.",
          "The main entity is named but related ones are left vague or referred to inconsistently.",
          "Entities are named, though some appear in shortened forms that could be confused with others.",
          "Every significant entity is named in full at least once, with enough surrounding detail to distinguish it from similarly named things.",
        ],
      ),
  },
  {
    id: "authority_signals",
    pillars: ["geo"],
    label: "Grounds for trust",
    weight: 2,
    remedy:
      "State who produced this and how they know: credentials, sample size, method, date of testing. Generative engines weigh provenance heavily.",
    build: () =>
      score(
        "How well does `page.content` establish why its claims should be trusted?",
        [
          "No basis is offered — no author, no method, no sources, no credentials.",
          "Trust rests entirely on tone; nothing verifiable is offered.",
          "Some grounding appears, such as a named author or a reference to how a conclusion was reached.",
          "Provenance is explicit: who produced it, how they know, what they measured, and when.",
        ],
      ),
  },
  {
    id: "promotional_tone",
    pillars: ["geo"],
    label: "Promotional distortion",
    weight: 1.5,
    invert: true,
    remedy:
      "Strip the superlatives. Generative engines down-weight copy that reads as marketing, because it cannot be repeated as fact.",
    build: () =>
      noul(
        "Does `page.content` read as promotional copy, to the point where a neutral assistant would hesitate to repeat its claims as fact?",
        {
          true: "Superlatives and unsupported self-praise dominate; the page argues for a purchase rather than explaining a subject.",
          false: "The tone is explanatory, and any commercial interest is stated rather than disguised.",
        },
      ),
  },
  {
    id: "dated_claims",
    pillars: ["geo"],
    label: "Time-anchored claims",
    weight: 1,
    remedy:
      "Attach a date to anything that changes — prices, versions, statistics. Undated claims are treated as possibly stale and skipped.",
    build: () =>
      noul(
        "Are the time-sensitive claims in `page.content` — prices, versions, statistics, rankings — anchored to a stated date or period?",
        {
          true: "Time-sensitive claims state when they were true, or the content contains no time-sensitive claims at all.",
          false: "Figures that change over time are presented with no indication of when they were accurate.",
        },
      ),
  },
];

/** Build the questions that apply to this page, keyed by dimension id. */
export function buildQuestions(
  facts: PageFacts,
  input: AnalysisInput,
): { questions: Record<string, Question>; applied: Dimension[] } {
  const applied = DIMENSIONS.filter((d) => !d.applies || d.applies(facts, input));
  const questions: Record<string, Question> = {};
  for (const dimension of applied) questions[dimension.id] = dimension.build();
  if (input.targetQuery?.trim()) questions.__intent = INTENT_QUESTION;
  return { questions, applied };
}
