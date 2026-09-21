/**
 * The page-action vocabulary, shared by the server that produces a decision
 * and the client that renders it. No server-only imports live here, so a
 * client component can read the labels without pulling in the SDK.
 */

export type PageAction = "leave" | "improve" | "rewrite" | "merge" | "prune" | "split";

export const PAGE_ACTIONS: readonly PageAction[] = [
  "leave",
  "improve",
  "rewrite",
  "merge",
  "prune",
  "split",
] as const;

export const ACTION_LABEL: Record<PageAction, string> = {
  leave: "Leave alone",
  improve: "Improve",
  rewrite: "Rewrite",
  merge: "Merge",
  prune: "Remove",
  split: "Split up",
};

export const ACTION_BLURB: Record<PageAction, string> = {
  leave: "Working. Spend the time elsewhere.",
  improve: "Sound foundation, specific gaps to close.",
  rewrite: "Right topic, the execution needs redoing.",
  merge: "Overlaps another page; fold them together.",
  prune: "Earns nothing and dilutes the rest.",
  split: "Covers several intents; separate them.",
};
